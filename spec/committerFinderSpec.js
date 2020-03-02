const mock = require("mock-require");

// takes projectId, mergeRequestId, gitlabToken
describe("committer finder", () => {
  // variables for using in tests
  // put bad ones in individually
  const goodProjectId = "12345";
  const goodMergeRequestId = "3";
  const goodGitlabToken = "mad3u9t0k3n";

  const web_url = "https://gitlab.com/api/v4/projects/";

  // taken from gitlab API documentation & changed a bit
  const bobCommit = {
    id: "abb37a253b50b4370f6ee794676502b48383c7cb",
    short_id: "abb37a253b5",
    title: "Replace elephants with pigeons",
    author_name: "Bob Bobbity",
    author_email: "bbobbity@badgertime.com",
    created_at: "2015-11-03T07:23:12+08:00",
    message: "Replace elephants with pigeons"
  };

  const clarindaCommit = {
    id: "c4b3745653b50b770f6ee734676aaaaaaaaaaaaa",
    short_id: "c4b3745653b",
    title: "Sharpen focus on tusks",
    author_name: "Clarinda Mvula",
    author_email: "clarinda@badgertime.com",
    created_at: "2013-11-03T07:23:12+08:00",
    message: "Sharpen focus on tusks"
  };

  const steveCommit = {
    id: "2205942438c14ec7be21c6ce5bd945243b3fab31",
    short_id: "2205942438c",
    title: "Reduce variance of flange nodes",
    author_name: "Stevey",
    author_email: "stevey.steve@gmail.com",
    created_at: "2012-09-20T09:06:12+03:00",
    message: "Reduce variance of flange nodes"
  };

  let clarindaBCommit = {
    id: "c4a3745653b503470f6ee734676aa234aaaa55aa",
    short_id: "c4a3745653b",
    title: "Release the bees",
    author_name: "Clarinda Mvula",
    author_email: "clarinda@hotmail.com",
    created_at: "2013-01-03T07:23:12+08:00",
    message: "Release the bees"
  };

  let clarindaCCommit = {
    id: "14b3145653b50b7e0f6ee7346765aaaaaaaaaaaa",
    short_id: "14b3745653b",
    title: "Put a banging donk on it",
    author_name: "Clarinda Mvula",
    author_email: "cmvula@madeupemail.com",
    created_at: "2015-11-03T07:23:12+08:00",
    message: "Put a banging donk on it"
  };

  const clarindaAliasCommit = {
    id: "e4b3745653450b770f6ee734676aaaaaaaaaaaaa",
    short_id: "e4b37456534",
    title: "Do the needful",
    author_name: "Clarinda M",
    author_email: "clarinda@badgertime.com",
    created_at: "2013-11-03T07:23:12+08:00",
    message: "Do the needful"
  };

  const noEmailBobCommit = {
    id: "abb34a253b50b4370f6ee794676502b48383c7cb",
    short_id: "abb34a253b5",
    title: "Replace elephants with pigeons",
    author_name: "Bob Bobbity",
    created_at: "2015-11-03T07:23:12+08:00",
    message: "Replace elephants with pigeons"
  };

  const unmappedEmailCommit = {
    id: "c4b3745643b50b776f6ee734676aaba4aaa8a6aa",
    short_id: "c4b3745643b",
    title: "Tear it apart",
    author_name: "Lisa",
    author_email: "lisaWithNoLogin@badgertime.com",
    created_at: "2013-11-03T07:23:12+08:00",
    message: "Tear it apart"
  };

  const sortResponse = function(unsortedResponse) {
    return {
      unresolvedLoginNames: unsortedResponse.unresolvedLoginNames.sort(),
      distinctUsersToVerify: unsortedResponse.distinctUsersToVerify
        .map(function(name) {
          return name.email;
        })
        .sort()
    };
  };

  const distinctCommitterCommits = [bobCommit, clarindaCommit, steveCommit];

  // getUserInfo returns an object like this wrapped in an array
  const bobLogin = { username: "bbobbity" };
  const clarindaLogin = { username: "clarinda" };
  const steveLogin = { username: "steveySteve" };
  const clarindaBLogin = { username: "cmvu" };
  const clarindaCLogin = { username: "clarindam" };

  // committers in format returned by committerFinder
  const bobCommitter = {
    email: bobCommit.author_email,
    name: bobCommit.author_name,
    login: bobLogin.username
  };

  const clarindaCommitter = {
    email: clarindaCommit.author_email,
    name: clarindaCommit.author_name,
    login: clarindaLogin.username
  };

  const steveCommitter = {
    email: steveCommit.author_email,
    name: steveCommit.author_name,
    login: steveLogin.username
  };

  const clarindaBCommitter = {
    email: clarindaBCommit.author_email,
    name: clarindaBCommit.author_name,
    login: clarindaBLogin.username
  };

  const clarindaCCommitter = {
    email: clarindaCCommit.author_email,
    name: clarindaCCommit.author_name,
    login: clarindaCLogin.username
  };

  const committersWithLogins = [
    bobCommitter,
    clarindaCommitter,
    steveCommitter
  ];

  // general purpose mocks
  let gitlabApiMocks = {};

  gitlabApiMocks.gitlabRequest = function(opts, token, method) {
    if (token !== goodGitlabToken) {
      return Promise.reject(
        new Error(`API request ${web_url} failed with status 401`)
      );
    }

    if (opts instanceof Error) {
      return Promise.reject(opts);
    } else {
      return Promise.resolve(opts);
    }
  };

  gitlabApiMocks.getCommits = function(projectId, mergeRequestId) {
    if (projectId !== goodProjectId || mergeRequestId !== goodMergeRequestId) {
      return new Error(`API request ${web_url} failed with status 404`);
    }

    return distinctCommitterCommits;
  };

  gitlabApiMocks.getUserInfo = function(emailAddress) {
    switch (emailAddress) {
      case bobCommit.author_email:
        return [bobLogin];
      case clarindaCommit.author_email:
        return [clarindaLogin];
      case steveCommit.author_email:
        return [steveLogin];
      case clarindaBCommit.author_email:
        return [clarindaBLogin];
      case clarindaCCommit.author_email:
        return [clarindaCLogin];
      default:
        return [];
    }
  };

  beforeAll(() => {
    // make sure nothing else is mocking this/cancel the last one
    mock.stop("../src/gitlabApi");
    mock.stop("../src/committerFinder");

    mock("../src/logger", {
      debug: function(message) {},
      error: function(message) {},
      flush: function(message) {},
      info: function(message) {}
    });
  });

  beforeEach(() => {
    mock.stop("../src/gitlabApi");
  });

  afterAll(() => {
    mock.stop("../src/gitlabApi");
    mock.stop("../src/logger");
    mock.stop("../src/committerFinder");
  });

  /*********************** TEST CASES ***********************/

  // changing parameters is pretty pointless given that everything that depends on them is mocked out
  // TODO: don't need to enforce ordering of committers with tests - change checks to accept any order

  it("handles errors from Gitlab for bad project ID", async function() {
    mock("../src/gitlabApi", gitlabApiMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    // takes projectId, mergeRequestId, gitlabToken
    let response = await committerFinder(
      "badProjectId",
      goodMergeRequestId,
      goodGitlabToken
    ).catch(function(error) {
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
      expect(error.message).toEqual(
        `API request ${web_url} failed with status 404`
      );
    });

    expect(response).toBeUndefined();
  });

  it("handles errors from Gitlab for bad merge request ID", async function() {
    mock("../src/gitlabApi", gitlabApiMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    let response = await committerFinder(
      goodProjectId,
      "badMergeRequestId",
      goodGitlabToken
    ).catch(function(error) {
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
      expect(error.message).toEqual(
        `API request ${web_url} failed with status 404`
      );
    });

    expect(response).toBeUndefined();
  });

  it("handles errors from Gitlab for bad token", async function() {
    mock("../src/gitlabApi", gitlabApiMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    let response = await committerFinder(
      goodProjectId,
      goodMergeRequestId,
      "badGitlabToken"
    ).catch(function(error) {
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
      expect(error.message).toEqual(
        `API request ${web_url} failed with status 401`
      );
    });

    expect(response).toBeUndefined();
  });

  // Is this possible?
  it("copes with receiving an empty commit list", async function() {
    let emptyCommitListMocks = {};
    emptyCommitListMocks.gitlabRequest = gitlabApiMocks.gitlabRequest;
    emptyCommitListMocks.getCommits = function(projectId, mergeRequestId) {
      return [];
    };
    emptyCommitListMocks.getUserInfo = gitlabApiMocks.getUserInfo;

    let expectedResponse = {
      unresolvedLoginNames: [],
      distinctUsersToVerify: []
    };

    mock("../src/gitlabApi", emptyCommitListMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    let response = await committerFinder(
      goodProjectId,
      goodMergeRequestId,
      goodGitlabToken
    );

    expect(sortResponse(response)).toEqual(sortResponse(expectedResponse));
  });

  it("retrieves and processes one committer with username findable", async function() {
    let oneCommitterMocks = {};

    oneCommitterMocks.gitlabRequest = gitlabApiMocks.gitlabRequest;
    oneCommitterMocks.getCommits = function(projectId, mergeRequestId) {
      return [bobCommit];
    };
    oneCommitterMocks.getUserInfo = gitlabApiMocks.getUserInfo;

    let expectedResponse = {
      unresolvedLoginNames: [],
      distinctUsersToVerify: [bobCommitter]
    };

    mock("../src/gitlabApi", oneCommitterMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    let response = await committerFinder(
      goodProjectId,
      goodMergeRequestId,
      goodGitlabToken
    );

    expect(sortResponse(response)).toEqual(sortResponse(expectedResponse));
  });

  // getUserInfo does a user search on e-mail
  // so an unknown user is a success case with empty data
  it("retrieves and processes one committer with no username findable", async function() {
    let oneCommitterNoEmailMocks = {};

    oneCommitterNoEmailMocks.gitlabRequest = gitlabApiMocks.gitlabRequest;
    oneCommitterNoEmailMocks.getCommits = function(projectId, mergeRequestId) {
      return [bobCommit];
    };
    oneCommitterNoEmailMocks.getUserInfo = function() {
      return [];
    };

    let expectedResponse = {
      unresolvedLoginNames: [bobCommitter.name],
      distinctUsersToVerify: []
    };

    mock("../src/gitlabApi", oneCommitterNoEmailMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    let response = await committerFinder(
      goodProjectId,
      goodMergeRequestId,
      goodGitlabToken
    );

    expect(sortResponse(response)).toEqual(sortResponse(expectedResponse));
  });

  it("can process a commit with null e-mail", async function() {
    const nullEmailCommit = {
      id: "abb37a253b50b4370f6ee794676502b48383c7cb",
      short_id: "abb37a253b5",
      title: "Replace elephants with pigeons",
      author_name: "Bob Bobbity",
      author_email: null,
      created_at: "2015-11-03T07:23:12+08:00",
      message: "Replace elephants with pigeons"
    };

    let nullEmailMocks = {};
    nullEmailMocks.gitlabRequest = gitlabApiMocks.gitlabRequest;
    nullEmailMocks.getCommits = function(projectId, mergeRequestId) {
      return [nullEmailCommit];
    };
    // shouldn't reach this one
    nullEmailMocks.getUserInfo = gitlabApiMocks.getUserInfo;

    let expectedResponse = {
      unresolvedLoginNames: [bobCommitter.name],
      distinctUsersToVerify: []
    };

    mock("../src/gitlabApi", nullEmailMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    let response = await committerFinder(
      goodProjectId,
      goodMergeRequestId,
      goodGitlabToken
    );

    expect(sortResponse(response)).toEqual(sortResponse(expectedResponse));
  });

  it("can process a commit with no e-mail", async function() {
    let noEmailMocks = {};
    noEmailMocks.gitlabRequest = gitlabApiMocks.gitlabRequest;
    noEmailMocks.getCommits = function(projectId, mergeRequestId) {
      return [noEmailBobCommit];
    };
    // shouldn't reach this one but need something to require
    noEmailMocks.getUserInfo = gitlabApiMocks.getUserInfo;

    let expectedResponse = {
      unresolvedLoginNames: [bobCommitter.name],
      distinctUsersToVerify: []
    };

    mock("../src/gitlabApi", noEmailMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    let response = await committerFinder(
      goodProjectId,
      goodMergeRequestId,
      goodGitlabToken
    );

    expect(sortResponse(response)).toEqual(sortResponse(expectedResponse));
  });

  it("can retrieve user info for three distinct committers from three commits", async function() {
    mock("../src/gitlabApi", gitlabApiMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    let response = await committerFinder(
      goodProjectId,
      goodMergeRequestId,
      goodGitlabToken
    );

    let expectedResponse = {
      unresolvedLoginNames: [],
      distinctUsersToVerify: committersWithLogins
    };
    expect(sortResponse(response)).toEqual(sortResponse(expectedResponse));
  });

  it("can deduplicate committers by e-mail", async function() {
    let clarindaBCommitSameEmail = {
      id: "c4b3745653b503470f6ee734676aa234aaaa55aa",
      short_id: "c4b3745653b",
      title: "Sharpen focus on tusks",
      author_name: clarindaCommitter.name,
      author_email: clarindaCommitter.email,
      created_at: "2013-01-03T07:23:12+08:00",
      message: "Release the bees"
    };

    let duplicateCommitterMocks = {};
    duplicateCommitterMocks.gitlabRequest = gitlabApiMocks.gitlabRequest;
    duplicateCommitterMocks.getCommits = function(projectId, mergeRequestId) {
      return [bobCommit, clarindaCommit, clarindaBCommitSameEmail];
    };
    duplicateCommitterMocks.getUserInfo = gitlabApiMocks.getUserInfo;

    mock("../src/gitlabApi", duplicateCommitterMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    let response = await committerFinder(
      goodProjectId,
      goodMergeRequestId,
      goodGitlabToken
    );

    let expectedResponse = {
      unresolvedLoginNames: [],
      distinctUsersToVerify: [clarindaCommitter, bobCommitter]
    };

    expect(sortResponse(response)).toEqual(sortResponse(expectedResponse));
  });

  it("treats committers with the same name but different e-mails separately", async function() {
    let duplicateCommitterMocks = {};
    duplicateCommitterMocks.gitlabRequest = gitlabApiMocks.gitlabRequest;
    duplicateCommitterMocks.getCommits = function(projectId, mergeRequestId) {
      return [clarindaCommit, clarindaBCommit, clarindaCCommit];
    };
    duplicateCommitterMocks.getUserInfo = gitlabApiMocks.getUserInfo;

    mock("../src/gitlabApi", duplicateCommitterMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    let response = await committerFinder(
      goodProjectId,
      goodMergeRequestId,
      goodGitlabToken
    );

    let expectedResponse = {
      unresolvedLoginNames: [],
      distinctUsersToVerify: [
        clarindaCommitter,
        clarindaBCommitter,
        clarindaCCommitter
      ]
    };

    expect(sortResponse(response)).toEqual(sortResponse(expectedResponse));
  });

  it("can identify the same person with two aliases by e-mail", async function() {
    let duplicateCommitterSameEmailMocks = {};
    duplicateCommitterSameEmailMocks.gitlabRequest =
      gitlabApiMocks.gitlabRequest;
    duplicateCommitterSameEmailMocks.getCommits = function(
      projectId,
      mergeRequestId
    ) {
      return [clarindaCommit, clarindaAliasCommit];
    };
    duplicateCommitterSameEmailMocks.getUserInfo = gitlabApiMocks.getUserInfo;

    mock("../src/gitlabApi", duplicateCommitterSameEmailMocks);
    const committerFinder = mock.reRequire("../src/committerFinder");
    let response = await committerFinder(
      goodProjectId,
      goodMergeRequestId,
      goodGitlabToken
    );

    let expectedResponse = {
      unresolvedLoginNames: [],
      distinctUsersToVerify: [clarindaCommitter]
    };

    expect(sortResponse(response)).toEqual(sortResponse(expectedResponse));
  });
});
