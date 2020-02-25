"use strict";
const fs = require("fs");
const is = require("is_js");
const path = require("path");
const handlebars = require("handlebars");
const gitlabApi = require("./gitlabApi");
const logger = require("./logger");
const contributionVerifier = require("./contributionVerifier");
const getCommitterInfo = require("./committerFinder");

const gitlabToken = process.env.GITLAB_ACCESS_TOKEN;
const botName = "gitlab-cla-bot";

/*******/
const defaultConfig = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "default.json"))
);

// At the moment we're only accepting triggers from merge requests (updates or notes added)
const validAction = webhook =>
  webhook.object_kind === "merge_request" ||
  (webhook.object_kind === "note" &&
    webhook.object_attributes.noteable_type == "MergeRequest");

const applyToken = token => {
  const api = {};
  let gitlabRequest = gitlabApi.gitlabRequest;
  Object.keys(gitlabApi).forEach(apiMethod => {
    api[apiMethod] = (...args) =>
      gitlabRequest(gitlabApi[apiMethod].apply(null, args), token);
  });
  return api;
};

const gitLabInfo = webhook =>
  webhook.object_kind === "note"
    ? {
        projectId: webhook.project.id,
        mergeRequestId: webhook.merge_request.iid,
        projectUrl: webhook.project.web_url
      }
    : {
        projectId: webhook.project.id,
        mergeRequestId: webhook.object_attributes.iid,
        projectUrl: webhook.project.web_url
      };

const obtainToken = webhook => gitlabToken;

const commentSummonsBot = comment =>
  comment.match(new RegExp(`@${botName}(\\[bot\\])?\\s*check`)) !== null;

const response = body => ({
  statusCode: 200,
  body: JSON.stringify(body)
});

// extract JSON from request body to pass to the event handler, return the result in an object
const constructHandler = fn => async ({ body }, lambdaContext, callback) => {
  try {
    const res = await fn(JSON.parse(body));

    if (typeof res === "string") {
      logger.debug("integration webhook callback response: ", res);
      callback(null, response({ message: res }));
    } else {
      logger.error(`unexpected lambda function return value: ${res}`);
    }
  } catch (err) {
    logger.error(err.toString());
    callback(err.toString());
  }

  logger.flush();
};

exports.Handler = constructHandler(async webhook => {
  if (!validAction(webhook)) {
    return `ignored action of type ${webhook.object_kind}`;
  }

  if (webhook.object_kind === "note") {
    if (!commentSummonsBot(webhook.object_attributes.note)) {
      return `the following comment didn't summon the cla-bot because the string pattern to summon was not met: ${webhook.object_attributes.note}`;
    }
    // TODO : Check if the CLA bot has summoned itself

    logger.info("The cla-bot has been summoned by a comment");
  }

  const token = obtainToken(webhook);
  const {
    addComment,
    getMergeRequest,
    getProjectClaFile,
    setCommitStatus,
    getProjectLabels,
    createProjectLabel,
    updateMergeRequestLabels
  } = applyToken(token);

  const {
    projectId: projectId,
    mergeRequestId: mergeRequestId,
    projectUrl: projectUrl
  } = gitLabInfo(webhook);
  const mergeRequestUrl = `${projectUrl}/merge_requests/${mergeRequestId}`;

  const SendTokenisedComment = async (comment, tokens) => {
    const template = handlebars.compile(comment);
    let msg = template(tokens);
    await addComment(projectId, mergeRequestId, msg);
  };

  const MRInfo = await getMergeRequest(projectId, mergeRequestId);
  const headSha = MRInfo.sha;

  // TODO : Investigate group level .clabot file.
  let claConfig = await getProjectClaFile(projectId);
  if (!is.json(claConfig)) {
    logger.error("The .clabot file is not valid JSON");
    await setCommitStatus(projectId, headSha, "failed", botName);
    throw new Error("The .clabot file is not valid JSON");
  }

  const botConfig = Object.assign({}, defaultConfig, claConfig);

  // Ensure the label exists on the project
  var existingLabels = await getProjectLabels(projectId, botConfig.label);
  if (existingLabels.find(l => l.name === botConfig.label) === undefined) {
    await createProjectLabel(projectId, botConfig.label);
  }

  const addBotLabel = async () => {
    let labels = MRInfo.labels;
    if (!labels.includes(botConfig.label)) {
      labels.push(botConfig.label);
      await updateMergeRequestLabels(projectId, mergeRequestId, labels);
    }
  };

  const removeBotLabel = async () => {
    let labels = MRInfo.labels;
    const existingIdx = labels.indexOf(botConfig.label);
    if (existingIdx >= 0) {
      labels.splice(existingIdx, 1);
      await updateMergeRequestLabels(projectId, mergeRequestId, labels);
    }
  };

  const removeLabelAndUnapprove = async users => {
    await removeBotLabel();
    await setCommitStatus(projectId, headSha, "failed", botName);
    return `CLA has not been signed by users ${users}, added a comment to ${mergeRequestUrl}`;
  };

  const committerInfo = await getCommitterInfo(
    projectId,
    mergeRequestId,
    gitlabToken
  );

  let message;
  if (committerInfo.unresolvedLoginNames.length > 0) {
    const unidentifiedString = committerInfo.unresolvedLoginNames.join(", ");
    logger.info(
      `Some commits from the following contributors are not signed with a valid email address: ${unidentifiedString}. `
    );
    await SendTokenisedComment(botConfig.messageMissingEmail, {
      unidentifiedUsers: unidentifiedString
    });

    await removeLabelAndUnapprove(unidentifiedString);
    message = `Unable to determine CLA status for users ${unidentifiedString}, added a comment to ${mergeRequestUrl}`;
  } else {
    const verifier = contributionVerifier(botConfig);
    const nonContributors = await verifier(
      committerInfo.distinctUsersToVerify,
      gitlabToken
    );

    if (nonContributors.length === 0) {
      logger.info(
        "All contributors have a signed CLA, adding success status to the commit and a label"
      );
      await addBotLabel();
      await setCommitStatus(projectId, headSha, "success", botName);

      message = `Updated commit status and added label ${botConfig.label} to ${mergeRequestUrl}`;
    } else {
      const usersWithoutCLA = nonContributors
        .map(login => `@${login}`)
        .join(", ");

      logger.info(
        `The contributors ${usersWithoutCLA} have not signed the CLA`
      );
      await SendTokenisedComment(botConfig.message, {
        usersWithoutCLA: usersWithoutCLA
      });

      await removeLabelAndUnapprove(usersWithoutCLA);
      message = `CLA has not been signed by users ${usersWithoutCLA}, added a comment to ${mergeRequestUrl}`;
    }
  }

  if (webhook.object_kind === "note") {
    await addComment(projectId, mergeRequestId, botConfig.recheckComment);
  }

  return message;
});
