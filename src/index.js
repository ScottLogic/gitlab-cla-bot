'use strict'
const express = require('express')
const fs = require("fs");
const is = require("is_js");
const path = require("path");
const handlebars = require("handlebars");
const gitlabApi = require("./gitlabApi");
const logger = require("./logger");
const contributionVerifier = require("./contributionVerifier");

const app = express()
const port = 3000
const gitlabToken = process.argv[2];
const gitlabRepoToken = process.argv[3];
const botName = "gitlab-cla-bot";

app.use(express.json())

app.get('/', (req, res) => res.end('Please send a post request'))

app.post('/', async function (req, res) {
  try{
    var body = req.body;
    var msg = await Handler(body)
    res.send(msg)
  }
  catch (err)
  {
    logger.error(err.toString());
    res.send(err.toString());
  }
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))

/*******/
const sortUnique = arr => arr.sort((a, b) => a - b).filter((value, index, self) => self.indexOf(value, index + 1) === -1);

const defaultConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, "default.json")));

// TODO : Add support for MR actions not just merge request notes.
const validAction = webhook =>
  (webhook.object_kind === "note" &&  webhook.object_attributes.noteable_type == "MergeRequest");

const applyToken = token => {
    const api = {};
    let gitlabRequest = gitlabApi.gitlabRequest;
    Object.keys(gitlabApi).forEach(apiMethod => {
      api[apiMethod] = (...args) =>
        gitlabRequest(gitlabApi[apiMethod].apply(null, args), token);
    });
    return api;
  };

const gitLabInfo = webhook => {
  return {
        projectId: webhook.project.id,
        mergeRequestId: webhook.merge_request.iid,
        projectUrl: webhook.project.web_url
  }};

const obtainToken = webhook => gitlabToken

const commentSummonsBot = comment => comment.match(new RegExp(`@${botName}(\\[bot\\])?\\s*check`)) !== null;

const Handler = async webhook => 
{
    if (!validAction(webhook)) {
        return `ignored action of type ${webhook.object_kind}`;
    }

    if (webhook.object_kind === "note") {
        if (!commentSummonsBot(webhook.object_attributes.note)) {
            return "the comment didn\'t summon the cla-bot";
        }
        // TODO : Check if the CLA bot has summoned itself

        logger.info("The cla-bot has been summoned by a comment")
    }

    const token = obtainToken(webhook);
    const {
        getCommits,
        addComment
      } = applyToken(token);
      
    const {
      getProjectClaFile
    } = applyToken(gitlabRepoToken);

    const { projectId: projectId, mergeRequestId: mergeRequestId, projectUrl: projectUrl } = gitLabInfo(webhook);
    const mergeRequestUrl = `${projectUrl}/merge_requests/${mergeRequestId}`;

    const SendTokenisedComment = async (comment, tokens) =>
    {
      const template = handlebars.compile(comment);
      let msg = template(tokens);
      await addComment(projectId, mergeRequestId, msg)
    }

    logger.info("Obtaining the list of commits for the pull request");
    const commits = await getCommits(projectId, mergeRequestId);
  
    logger.info(`Total Commits: ${commits.length}, checking CLA status for committers`);

    const unresolvedLoginNames = sortUnique(
      commits.filter(c => c.author_email == null).map(c => c.committer_name)
    );

    // TODO : Get the SHA if we're planning on approving

    // TODO : Investigate org level .clabot file. Also, does the github version search for files as opposed to knowing where they are stored?
    let claConfig = await getProjectClaFile(projectId);
    if (!is.json(claConfig)) {
      logger.error("The .clabot file is not valid JSON");
      // TODO : Work out how we 'set the status' in gitlab
      // await setStatus(webhook, headSha, "error", logFile);
      throw new Error("The .clabot file is not valid JSON");
    }

    const botConfig = Object.assign({}, defaultConfig, claConfig);
    
    const removeLabelAndSetFailureStatus = async users => {
      // TODO : Work out how to add and delete labels to gitlab MR's
      //await deleteLabel(issueUrl, botConfig.label);

      // TODO : Work out how we 'set the status' in gitlab
      //await setStatus(webhook, headSha, "error", logFile);
      return `CLA has not been signed by users ${users}, added a comment to ${mergeRequestUrl}`;
    };

    let message;
    if(unresolvedLoginNames.length > 0) {
      const unidentifiedString = unresolvedLoginNames.join(", ");
      logger.info(`Some commits from the following contributors are not signed with a valid email address: ${unidentifiedString}. `);
      await SendTokenisedComment(botConfig.messageMissingEmail, unidentifiedString);

      message = removeLabelAndSetFailureStatus(unidentifiedString);
    } else {
      const verifier = contributionVerifier(botConfig);
      const nonContributors = await verifier(commits, token);

      if(nonContributors.length === 0) {
        logger.info("All contributors have a signed CLA, adding success status to the pull request and a label");
        // TODO : Add the label if it doesn't exist (also, can they be added twice?)

        // TODO : Work out how we 'set the status' in gitlab
        // await setStatus(webhook, headSha, "success", logFile);

        message = `added label ${botConfig.label} to ${mergeRequestUrl}`;
      } else {
        const usersWithoutCla = sortUnique(nonContributors).map(contributorId => `@${contributorId}`).join(", ");

        logger.info(`The contributors ${usersWithoutCLA} have not signed the CLA`);
        await SendTokenisedComment(botConfig.message, usersWithoutCla);

        message = removeLabelAndSetFailureStatus(usersWithoutCla);
    }
  }

  if(webhook.object_kind === "note")
  {
    await addComment(projectId, mergeRequestId, botConfig.recheckComment);
  }

  return message
}

