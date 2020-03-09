const { gitlabRequest, getCommits, getUserInfo } = require("./gitlabApi");
const logger = require("./logger");

const getUniqueCommitters = arr =>
  arr.filter(
    (value, index, self) =>
      self.findIndex(c => c.email == value.email) === index
  );

const getUserPayload = userData => {
  let ghId = undefined;
  if (userData.length > 0) {
    if (userData[0].identities) {
      ghIdentity = userData[0].identities.filter(identity => identity.provider == 'github');
      if (ghIdentity.length > 0) {
        ghId = ghIdentity[0].extern_uid;
      }
    }
    return {
      ...userData[0],
      login: userData[0].username,
      gitHubId: ghId
    }
  } else return undefined;
}

const hydrateGitlabUserInfo = async (usersToVerify, token) =>
  Promise.all(
    usersToVerify.map(user =>
      gitlabRequest(getUserInfo(user.email), token).then(response => getUserPayload(response))
    )
  );

module.exports = async (projectId, mergeRequestId, gitlabToken) => {
  // Get the base commits from the gitlab API
  logger.info("Obtaining the list of commits for the merge request");
  const commits = await gitlabRequest(
    getCommits(projectId, mergeRequestId),
    gitlabToken
  );

  logger.info(
    `Total Commits: ${commits.length}, retrieving required information for committers`
  );

  let response = {
    unresolvedLoginNames: [],
    distinctUsersToVerify: []
  };

  let committers = commits.map(c => ({
    email: c.author_email,
    name: c.author_name
  }));
  let usersToVerify = getUniqueCommitters(committers);

  const unresolvedLoginNames = usersToVerify
    .filter(c => c.email == null)
    .map(c => c.name);
  if (unresolvedLoginNames.length > 0) {
    response.unresolvedLoginNames = unresolvedLoginNames;
    return response;
  }

  const hydratedUsersToVerify = await hydrateGitlabUserInfo(
    usersToVerify,
    gitlabToken
  );

  const unknownParticipants = hydratedUsersToVerify
    .filter(c => c.login === undefined)
    .map(u => u.name);
  if (unknownParticipants.length > 0) {
    // We've failed to look up a user by their email address.
    // TODO : Should this be a separate response message?
    response.unresolvedLoginNames = unknownParticipants;
    return response;
  }

  response.distinctUsersToVerify = hydratedUsersToVerify;
  return response;
};
