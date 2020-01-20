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

  exports.getCommits = (projectId, mergeRequestId) => ({
    url: `https://gitlab.com/api/v4/projects/${projectId}/merge_requests/${mergeRequestId}/commits`,
    method: "GET"
  });

  exports.getProjectClaFile = (projectId) => ({
    // TODO : Assumes master branch, which is probably not acceptable
    url: `https://gitlab.com/api/v4/projects/${projectId}/repository/files/%2Eclabot/raw?ref=master`,
    method: "GET"
  });

  exports.addComment = (projectId, mergeRequestId, comment) => ({
    url: `https://gitlab.com/api/v4/projects/${projectId}/merge_requests/${mergeRequestId}/notes`,
    body: {
      body: comment
    }
  }); 