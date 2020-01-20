const requestp = require("./requestAsPromise");

// TODO : Remove the use of private token
exports.gitlabRequest = (opts, token, method = "POST") =>
  requestp(
    Object.assign(
      {},
      {
        json: true,
        headers: {
          "Private-Token": `${token}`,
          "User-Agent": "gitlab-cla-bot"
        },
        method
      },
      opts
    )
  );

  exports.addRecheckComment = (projectId, mergeRequestId, recheckComment) => ({
    url: `https://gitlab.com/api/v4/projects/${projectId}/merge_requests/${mergeRequestId}/notes`,
    body: {
      body: recheckComment
    }
  });