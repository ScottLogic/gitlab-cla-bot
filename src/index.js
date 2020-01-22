'use strict'
const express = require('express')
const fs = require("fs");
const path = require("path");
const gitlabApi = require("./gitlabApi");

// TODO: replace with OAuth? Use hardcoded version for testing in lambda
const gitlabToken = process.argv[2];
const botName = "gitlab-cla-bot";

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

function buildResponse(statusCode, responseBody) {
  return {
       statusCode: statusCode,
       body: responseBody,
   };
}

exports.handler = async request => 
{
    let webhook = JSON.parse(request.body);
    if (!validAction(webhook)) {
        return buildResponse(400, `ignored action of type ${webhook.object_kind}`);
    }

    if (webhook.object_kind === "note" && webhook.object_attributes.noteable_type == "MergeRequest") {
        if (!commentSummonsBot(webhook.object_attributes.note)) {
            return buildResponse(200, "the comment didn\'t summon the cla-bot");
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

    return buildResponse(200, "Added new comment in response to webhook");
}