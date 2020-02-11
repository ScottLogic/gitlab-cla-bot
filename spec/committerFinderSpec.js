const mock = require("mock-require");

// takes projectId, mergeRequestId, gitlabToken
describe("committer finder", () => {

// variables for using in tests
// put bad ones in individually
const goodProjectId = "12345";
const goodMergeRequestId = "3";
const goodGitlabToken = "mad3u9t0k3n";

const web_url = "http://foo.com/user/testproject";

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

// add some more?

// beforeEach
beforeEach(() => {
    // but actually mock this?
    // mock.stop("../src/gitlabApi");
    
    mock("../src/logger", {
      debug: function(message) {},
      error: function(message) {},
      flush: function(message) {},
      info: function(message) {}
    });

    // return something settable?
    // mock("../src/gitlabApi", {
    //   gitlabRequest: function() {
    //     // usually returns a promise :/
    //     // create one and then resolve it?
    //     // inspect input and return appropriate output?
    //     // or mock-per-test
    //     console.log("Hello I'm a mock for gitlabRequest");
    //     return Promise.reject(new Error(
    //       `API request ${web_url} failed with status ${'404'}`
    //      ));
    //   },
    //   getCommits: function() {
    //     console.log("I'm a mock for getCommits");
    //   }
    // });

});

// after?

// tests

it("should handle error from Gitlab for bad project ID", async function() {
  // change to set up mock here
  mock("../src/gitlabApi", {
    gitlabRequest: function() {
      return Promise.reject(new Error(
        `API request ${web_url} failed with status ${'404'}`
       ));
    },
    getCommits: function() {
      // this gets called - why?
      console.log("I'm a mock for getCommits");
    }
  });

  const committerFinder = require("../src/committerFinder");
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

// bad mergeRequestId
// bad gitlabToken

// retrieved commit list empty (shouldn't be possible?)
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