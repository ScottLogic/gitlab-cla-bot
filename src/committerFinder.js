const { gitlabRequest, getCommits, getParticipants } = require("./gitlabApi");
const logger = require("./logger");

const sortUnique = arr => arr.sort((a, b) => a - b).filter((value, index, self) => self.indexOf(value, index + 1) === -1);

module.exports = async (projectId, mergeRequestId, gitlabToken) => {
    // Get the base commits from the gitlab API
    logger.info("Obtaining the list of commits for the merge request");
    const commits = await gitlabRequest(getCommits(projectId, mergeRequestId), gitlabToken);

    logger.info(`Total Commits: ${commits.length}, retrieving required information for committers`);

    let response = {
        unresolvedLoginNames: [],
        unknownParticipants: [],
        distinctUsersToVerify: []
    }

    // TODO : Should we be checking against the github login emails. i.e. does it matter if they don't have gitlab email addresses set?
    const unresolvedLoginNames = sortUnique(commits.filter(c => c.author_email == null).map(c => c.author_name));
    if(unresolvedLoginNames.length > 0) {
        response.unresolvedLoginNames = unresolvedLoginNames
        return response;
    }
  
    // Need to retrieve the gitlab usernames from the participants. If any of the committers can't be found
    const participants = await gitlabRequest(getParticipants(projectId, mergeRequestId), gitlabToken);
    usersToVerify = sortUnique(commits.map(c => ({ email : c.author_email, name : c.author_name })));

    usersToVerify.forEach(user => {
        let matchingParticipant = participants.find(p => p.name == user.name)
        if(matchingParticipant !== undefined)
        {
            user.login = matchingParticipant.username;
        }
    });

    const unknownParticipants = usersToVerify.filter(c => c.login === undefined).map(u => u.name);
    if(unknownParticipants.length > 0) {
        response.unknownParticipants = unknownParticipants
        return response;
    }

    response.distinctUsersToVerify = sortUnique(usersToVerify);
    return response;
};