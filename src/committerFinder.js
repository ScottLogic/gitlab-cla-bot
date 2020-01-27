const { gitlabRequest, getCommits, getUserInfo } = require("./gitlabApi");
const logger = require("./logger");

const getUniqueCommitters = arr => arr.filter((value, index, self) => self.findIndex(c => c.email == value.email) === index);

const hydrateGitlabUserInfo = async (usersToVerify, token) =>
    Promise.all(
        usersToVerify.map(user => 
            gitlabRequest(getUserInfo(user.email), token)
            .then(response => ({
                ...user,
                login: response.length > 0 ? response[0].username  : undefined
            }))
        )
    );

module.exports = async (projectId, mergeRequestId, gitlabToken) => {
    // Get the base commits from the gitlab API
    logger.info("Obtaining the list of commits for the merge request");
    const commits = await gitlabRequest(getCommits(projectId, mergeRequestId), gitlabToken);

    logger.info(`Total Commits: ${commits.length}, retrieving required information for committers`);

    let response = {
        unresolvedLoginNames: [],
        distinctUsersToVerify: []
    }

    let committers = commits.map(c => ({ email : c.author_email, name : c.author_name }));
    let usersToVerify = getUniqueCommitters(committers);

    const unresolvedLoginNames = usersToVerify.filter(c => c.email == null).map(c => c.name);
    if(unresolvedLoginNames.length > 0) {
        response.unresolvedLoginNames = unresolvedLoginNames
        return response;
    }
  
    const hydratedUsersToVerify = await hydrateGitlabUserInfo(usersToVerify, gitlabToken);

    const unknownParticipants = hydratedUsersToVerify.filter(c => c.login === undefined).map(u => u.name);
    if(unknownParticipants.length > 0) {
        // This should never happen as gitlab users should have both an email and username
        throw new Error(`Failed to find the username for the following users ${unknownParticipants.join(", ")}`);
    }

    response.distinctUsersToVerify = hydratedUsersToVerify;
    return response;
};
