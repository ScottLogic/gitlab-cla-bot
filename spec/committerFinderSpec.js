const mock = require("mock-require");

// takes projectId, mergeRequestId, gitlabToken
describe("committer finder", () => {

// variables for using in tests
// put bad ones in individually
const goodProjectId = "12345";
const goodMergeRequestId = "3";
const goodGitlabToken = "mad3u9t0k3n";

const web_url = "https://gitlab.com/api/v4/projects/";

// cribbed from gitlab API documentation
const commitsInMR = [
  {
    "id": "abb37a253b50b4370f6ee794676502b48383c7cb",
    "short_id": "abb37a253b5",
    "title": "Replace elephants with pigeons",
    "author_name": "Bob Bobbity",
    "author_email": "bbobbity@badgertime.com",
    "created_at": "2015-11-03T07:23:12+08:00",
    "message": "Replace elephants with pigeons"
  },
  {
    "id": "c4b3745653b50b770f6ee734676aaaaaaaaaaaaa",
    "short_id": "c4b3745653b",
    "title": "Sharpen focus on tusks",
    "author_name": "Clarinda Mvula",
    "author_email": "clarinda@badgertime.com",
    "created_at": "2013-11-03T07:23:12+08:00",
    "message": "Sharpen focus on tusks"
  },
  {
    "id": "2205942438c14ec7be21c6ce5bd945243b3fab31",
    "short_id": "2205942438c",
    "title": "Reduce variance of flange nodes",
    "author_name": "Stevey",
    "author_email": "stevey.steve@gmail.com",
    "created_at": "2012-09-20T09:06:12+03:00",
    "message": "Reduce variance of flange nodes"
  }
];

const sampleResponse = {
  unresolvedLoginNames: [],
  distinctUsersToVerify: []
};

let gitlabApiMocks = {};

gitlabApiMocks.gitlabRequest = function(opts, token, method) {
  if(token !== goodGitlabToken)
  {
    return Promise.reject(new Error(
      `API request ${web_url} failed with status ${'401'}`
      ));
  }

  if(opts instanceof Error) {
    return Promise.reject(opts);
  } else {
    return Promise.resolve(opts);
  }
};

gitlabApiMocks.getCommits = function(projectId, mergeRequestId) {
  if( projectId !== goodProjectId || mergeRequestId !==goodMergeRequestId ) {
    return new Error(
      `API request ${web_url} failed with status ${'404'}`
     );
  }

  return commitsInMR;
};

// TODO: use good info to return user with login property
gitlabApiMocks.getUserInfo = function(emailAddress) {
  return [];
};

beforeAll(() => {
    // make sure nothing else is mocking this/cancel the last one
  mock.stop("../src/gitlabApi");
    
  mock("../src/logger", {
    debug: function(message) {},
    error: function(message) {},
    flush: function(message) {},
    info: function(message) {}
  });

});

// beforeEach
beforeEach(() => {
  mock.stop("../src/gitlabApi");
});

afterAll(() => {
  mock.stop("../src/gitlabApi");
  mock.stop("../src/logger");
});

/*********************** TEST CASES ***********************/

// changing parameters is pretty pointless given that everything that depends on them is mocked out

it("should handle error from Gitlab for bad project ID", async function() {
  mock("../src/gitlabApi", gitlabApiMocks);
  const committerFinder = mock.reRequire("../src/committerFinder");
  // takes projectId, mergeRequestId, gitlabToken
  let response = await committerFinder(
    "badProjectId", 
    goodMergeRequestId, 
    goodGitlabToken)
    .catch( function(error) {
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
      expect(error.message).toEqual(`API request ${web_url} failed with status ${'404'}`);
    } );

  expect(response).toBeUndefined();
});

it("should handle error from Gitlab for bad merge request ID", async function() {
  mock("../src/gitlabApi", gitlabApiMocks);
  const committerFinder = mock.reRequire("../src/committerFinder");
  let response = await committerFinder(
    goodProjectId, 
    "badMergeRequestId", 
    goodGitlabToken)
    .catch( function(error) {
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
      expect(error.message).toEqual(`API request ${web_url} failed with status ${'404'}`);
    } );

  expect(response).toBeUndefined();
});

it("should handle error from Gitlab for bad token", async function() {
  mock("../src/gitlabApi", gitlabApiMocks);
  const committerFinder = mock.reRequire("../src/committerFinder");
  let response = await committerFinder(
    goodProjectId, 
    goodMergeRequestId, 
    "badGitlabToken")
    .catch( function(error) {
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
      expect(error.message).toEqual(`API request ${web_url} failed with status ${'401'}`);
    } );

  expect(response).toBeUndefined();
});


// retrieved commit list empty (shouldn't be possible?)
// should this be an error case?
it("should cope with receiving an empty commit list", async function() {
  let emptyCommitListMocks = {};

  emptyCommitListMocks.getCommits = function(projectId, mergeRequestId) {
    return [];
  };

  emptyCommitListMocks.getUserInfo = function(emailAddress) {
    return [];
  };

  emptyCommitListMocks.gitlabRequest = function(opts, token, method) {
    if(token !== goodGitlabToken)
    {
      return Promise.reject(new Error(
        `API request ${web_url} failed with status ${'401'}`
        ));
    }
  
    if(opts instanceof Error) {
      return Promise.reject(opts);
    } else {
      return Promise.resolve(opts);
    }
  };

  let expectedResponse = {
    unresolvedLoginNames: [],
    distinctUsersToVerify: []
  };

  mock("../src/gitlabApi", emptyCommitListMocks);
  const committerFinder = mock.reRequire("../src/committerFinder.js");
  let response = await committerFinder(
    goodProjectId, 
    goodMergeRequestId, 
    goodGitlabToken
  );

  // is this not awaiting hard enough?
  
  expect(response).toEqual(expectedResponse);
});

// commit list 1, ok


// commit list 3 distinct, ok
// commit list 3, 2 distinct + one exact copy, ok
// commit list 3 same name different e-mail, ok
// commit list 3 different name same e-mail, ok

// commit list 1, no e-mails
// commit list 3, no e-mails
// commit list 1, no usernames
// commit list 3, no usernames
// commit list 3, some no e-mail & some no username
// commit list 3, 2 distinct & first copy has no e-mail
// commit list 3, 2 distinct & second copy has no e-mail

// username retrieval doesn't go so well
// no usernames matched
// one of three usernames matched



});