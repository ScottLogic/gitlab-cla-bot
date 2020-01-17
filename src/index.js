'use strict'
const express = require('express')
const fs = require("fs");
const path = require("path");
const gitlabApi = require("./gitlabApi");

const app = express()
const port = 3000
const gitlabToken = process.argv[2];
const botName = "gitlab-cla-bot";

app.use(express.json())

app.get('/', (req, res) => res.end('Please send a post request'))

app.post('/', async function (req, res) {
    var body = req.body;
    var msg = await Handler(body)
    res.send(msg)
  })

app.listen(port, () => console.log(`Example app listening on port ${port}!`))

/*******/
const defaultConfig = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "default.json"))
  );

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
        mergeRequestId: webhook.merge_request.iid
  }};

const obtainToken = webhook => gitlabToken

const commentSummonsBot = comment => comment.match(new RegExp(`@${botName}(\\[bot\\])?\\s*check`)) !== null;

const Handler = async webhook => 
{
    if (!validAction(webhook)) {
        return `ignored action of type ${webhook.object_kind}`;
    }

    if (webhook.object_kind === "note" && webhook.object_attributes.noteable_type == "MergeRequest") {
        if (!commentSummonsBot(webhook.object_attributes.note)) {
            return "the comment didn\'t summon the cla-bot";
        }
    }

    const token = obtainToken(webhook);
    const {
        addRecheckComment
      } = applyToken(token);

    const { projectId: projectId, mergeRequestId: mergeRequestId } = gitLabInfo(webhook);

    // TODO : Need to merge this with any deployed config
    const botConfig = defaultConfig;

    console.log("Adding recheck comment")
    await addRecheckComment(projectId, mergeRequestId, botConfig.recheckComment);

    return "Added new comment in response to webhook";
}