const mock = require("mock-require");

const noop = () => {};

console.info = noop;

describe("lambda function", () => {
  let event = {};
  let gitlabApiMocks = {};
  let actualSetStatusCount = 0;
  let actualAddCommentsCount = 0;
  let actualUpdateLabelsCount = 0;

  const bot_name = "gitlab-cla-bot";
  const project_id = "1234";
  const web_url = "http://foo.com/user/testproject";
  const merge_request_id = "5";
  const project_url = `${web_url}/merge_requests/${merge_request_id}`;
  const noteable_type = "MergeRequest";
  const note = `I am bot comment. @${bot_name} check`;
  const MR_sha = "test_sha";
  const bot_config = {
    label: "test_bot_label",
    recheckComment: "test_recheck_comment",
    message: "test_message {{usersWithoutCLA}} with_substitute_item",
    messageMissingEmail:
      "test_message_missing_email {{unidentifiedUsers}} with_substitute_item"
  };

  const user_to_verify = { login: "distinctUserToVerify" };
  const committersToFind = {
    unresolvedLoginNames: [],
    distinctUsersToVerify: []
  };

  beforeEach(() => {
    committersToFind.unresolvedLoginNames = [];
    committersToFind.distinctUsersToVerify = [user_to_verify];

    actualSetStatusCount = 0;
    actualAddCommentsCount = 0;
    actualUpdateLabelsCount = 0;

    // A standard event input for the lambda
    event = {
      body: {
        object_kind: "merge_request",
        project: {
          id: project_id,
          web_url: web_url
        },
        merge_request: {
          iid: merge_request_id
        },
        object_attributes: {
          iid: merge_request_id,
          noteable_type: noteable_type,
          note: note
        }
      }
    };

    mock("../src/committerFinder", () => committersToFind);
    mock("../src/contributionVerifier", () => usersToVerify =>
      usersToVerify
        .filter(u => u.login != user_to_verify.login)
        .map(u => u.login)
    );

    mock("../src/logger", {
      debug: function(message) {},
      error: function(message) {},
      flush: function(message) {},
      info: function(message) {}
    });

    gitlabApiMocks.gitlabRequest = opts => opts;

    gitlabApiMocks.getMergeRequest = () => ({
      sha: MR_sha,
      labels: [bot_config.label]
    });

    gitlabApiMocks.getProjectClaFile = () => bot_config;

    gitlabApiMocks.getProjectLabels = () => [{ name: bot_config.label }];

    setupUpdateStatusCall("success");

    // Remove the cached dependencies so that new mocks can be injected
    Object.keys(require.cache).forEach(key => {
      delete require.cache[key];
    });
  });

  const setupAddCommentCall = expectedComment => {
    gitlabApiMocks.addComment = (projectId, mergeRequestId, comment) => {
      expect(expectedComment).toEqual(comment);
      actualAddCommentsCount++;
    };
  };

  const setupUpdateLabelCall = expectedLabels => {
    gitlabApiMocks.updateMergeRequestLabels = (
      projectId,
      mergeRequestId,
      labels
    ) => {
      let arrayEquality =
        labels.length == expectedLabels.length &&
        labels.every((value, index) => value === expectedLabels[index]);
      expect(arrayEquality).toEqual(true);
      actualUpdateLabelsCount++;
    };
  };

  const setupUpdateStatusCall = expectedStatus => {
    gitlabApiMocks.setCommitStatus = (projectId, sha, status, context) => {
      expect(expectedStatus).toEqual(status);
      expect(context).toEqual(bot_name);
      actualSetStatusCount++;
    };
  };

  // the code has been migrated to the serverless framework which
  // stringifies the event body, and expects a stringified response
  const adaptedLambda = lambda => (ev, context, callback) => {
    ev.body = JSON.stringify(event.body);
    lambda(ev, context, (err, result) => {
      callback(
        err,
        result && result.body ? JSON.parse(result.body) : undefined
      );
    });
  };

  const runTest = (testInputs, done) => {
    mock("../src/gitlabApi.js", gitlabApiMocks);

    const lambda = require("../src/index.js");
    adaptedLambda(lambda.Handler)(event, {}, (err, result) => {
      if (testInputs.expectedError !== undefined) {
        expect(err).toEqual(testInputs.expectedError);
      } else {
        expect(err).toBeNull();
      }
      if (testInputs.expectedMessage !== undefined) {
        expect(result.message).toEqual(testInputs.expectedMessage);
      }

      if (testInputs.expectedactualSetStatusCount !== undefined) {
        expect(actualSetStatusCount).toEqual(
          testInputs.expectedactualSetStatusCount
        );
      }

      if (testInputs.expectedAddNoteCount !== undefined) {
        expect(actualAddCommentsCount).toEqual(testInputs.expectedAddNoteCount);
      }

      if (testInputs.expectedUpdateLabelsCount !== undefined) {
        expect(actualUpdateLabelsCount).toEqual(
          testInputs.expectedUpdateLabelsCount
        );
      }

      if (testInputs.cb !== undefined) {
        testInputs.cb();
      }

      done();
    });
  };

  /*********************** TEST CASES ***********************/

  it("should ignore events with an unknown object kind", done => {
    event.body.object_kind = "invalid_object_kind";

    runTest(
      {
        expectedMessage: "ignored action of type invalid_object_kind"
      },
      done
    );
  });

  it("should ignore note events with an invalid noteable type", done => {
    event.body.object_kind = "note";
    event.body.object_attributes.noteable_type = "invalid_noteable";

    runTest(
      {
        expectedMessage: "ignored action of type note"
      },
      done
    );
  });

  it("should ignore valid notes that do not summon the bot", done => {
    event.body.object_kind = "note";
    event.body.object_attributes.noteable_type = "MergeRequest";
    event.body.object_attributes.note =
      "I am a note that does not summon the bot";

    runTest(
      {
        expectedMessage: "the comment didn't summon the cla-bot"
      },
      done
    );
  });

  it("should add the label to the project if it doesn't already exist", done => {
    let addProjectLabelCount = 0;

    gitlabApiMocks.getProjectLabels = () => [{ name: "dummyLabel" }];

    gitlabApiMocks.createProjectLabel = (projectId, label) => {
      expect(label).toEqual(bot_config.label);
      addProjectLabelCount++;
    };

    runTest(
      {
        cb: () => expect(addProjectLabelCount).toEqual(1)
      },
      done
    );
  });

  describe("clabot configuration resolution", () => {
    it("should detect a malformed clabot file and set commit status", done => {
      gitlabApiMocks.getProjectClaFile = () => "I am not JSON";

      setupUpdateStatusCall("failed");

      runTest(
        {
          expectedError: "Error: The .clabot file is not valid JSON",
          expectedSetStatusCount: 1
        },
        done
      );
    });
  });

  describe("all contributors have signed the CLA", () => {
    it("should add recheck comment and set commit status if object_type is note", done => {
      event.body.object_kind = "note";
      setupAddCommentCall(bot_config.recheckComment);

      runTest(
        {
          expectedMessage: `Updated commit status and added label ${bot_config.label} to ${project_url}`,
          expectedAddNoteCount: 1,
          expectedSetStatusCount: 1
        },
        done
      );
    });

    it("should set commit status but not add recheck comment if object_type is merge_request", done => {
      event.body.object_kind = "merge_request";
      event.body.object_attributes.iid = merge_request_id;

      runTest(
        {
          expectedMessage: `Updated commit status and added label ${bot_config.label} to ${project_url}`,
          expectedAddNoteCount: 0,
          expectedSetStatusCount: 1
        },
        done
      );
    });

    it("should not attempt to add the bot label to the MR if it already exists", done => {
      runTest(
        {
          expectedMessage: `Updated commit status and added label ${bot_config.label} to ${project_url}`,
          expectedUpdateLabelsCount: 0
        },
        done
      );
    });

    it("should add the bot label to an MR if it hasn't already been added", done => {
      gitlabApiMocks.getMergeRequest = () => ({
        sha: MR_sha,
        labels: ["dummyLabel"]
      });

      setupUpdateLabelCall(["dummyLabel", bot_config.label]);

      runTest(
        {
          expectedMessage: `Updated commit status and added label ${bot_config.label} to ${project_url}`,
          expectedUpdateLabelsCount: 1
        },
        done
      );
    });
  });

  describe("some contributors have not signed the CLA", () => {
    beforeEach(() => {
      // Add some dummy contributors that the dummy verifier won't allow
      committersToFind.distinctUsersToVerify.push({
        login: "badUsername1"
      });
      committersToFind.distinctUsersToVerify.push({
        login: "badUsername2"
      });

      setupUpdateStatusCall("failed");
      setupUpdateLabelCall([]);

      setupAddCommentCall(
        bot_config.message.replace(
          "{{usersWithoutCLA}}",
          "@badUsername1, @badUsername2"
        )
      );
    });

    it("should set status, remove label and send a note hydrated with the login names of invalid users", done => {
      runTest(
        {
          expectedMessage: `CLA has not been signed by users @badUsername1, @badUsername2, added a comment to ${project_url}`,
          expectedAddNoteCount: 1,
          expectedSetStatusCount: 1,
          expectedUpdateLabelsCount: 1
        },
        done
      );
    });

    it("should remove only the bot specific label", done => {
      gitlabApiMocks.getMergeRequest = () => ({
        sha: MR_sha,
        labels: ["dummyLabel", bot_config.label, "dummyLabel2"]
      });

      setupUpdateLabelCall(["dummyLabel", "dummyLabel2"]);

      runTest(
        {
          expectedMessage: `CLA has not been signed by users @badUsername1, @badUsername2, added a comment to ${project_url}`,
          expectedUpdateLabelsCount: 1
        },
        done
      );
    });

    it("should not attempt to remove the label if it didn't already exist", done => {
      gitlabApiMocks.getMergeRequest = () => ({
        sha: MR_sha,
        labels: ["dummyLabel"]
      });

      setupUpdateLabelCall(["dummyLabel"]);

      runTest(
        {
          expectedMessage: `CLA has not been signed by users @badUsername1, @badUsername2, added a comment to ${project_url}`,
          expectedUpdateLabelsCount: 0
        },
        done
      );
    });
  });

  describe("some contributors do not have a valid email address on commits", () => {
    beforeEach(() => {
      // Add some unresolved login names
      committersToFind.unresolvedLoginNames.push("unresolvedUsername1");
      committersToFind.unresolvedLoginNames.push("unresolvedUsername2");

      setupUpdateStatusCall("failed");
      setupUpdateLabelCall([]);

      setupAddCommentCall(
        bot_config.messageMissingEmail.replace(
          "{{unidentifiedUsers}}",
          "unresolvedUsername1, unresolvedUsername2"
        )
      );
    });

    it("should set status, remove label and send a note hydrated with the login names of invalid users", done => {
      runTest(
        {
          expectedMessage: `Unable to determine CLA status for users unresolvedUsername1, unresolvedUsername2, added a comment to ${project_url}`,
          expectedAddNoteCount: 1,
          expectedSetStatusCount: 1,
          expectedUpdateLabelsCount: 1
        },
        done
      );
    });

    it("should remove only the bot specific label", done => {
      gitlabApiMocks.getMergeRequest = () => ({
        sha: MR_sha,
        labels: ["dummyLabel", bot_config.label, "dummyLabel2"]
      });

      setupUpdateLabelCall(["dummyLabel", "dummyLabel2"]);

      runTest(
        {
          expectedMessage: `Unable to determine CLA status for users unresolvedUsername1, unresolvedUsername2, added a comment to ${project_url}`,
          expectedUpdateLabelsCount: 1
        },
        done
      );
    });

    it("should not attempt to remove the label if it didn't already exist", done => {
      gitlabApiMocks.getMergeRequest = () => ({
        sha: MR_sha,
        labels: ["dummyLabel"]
      });

      setupUpdateLabelCall(["dummyLabel"]);

      runTest(
        {
          expectedMessage: `Unable to determine CLA status for users unresolvedUsername1, unresolvedUsername2, added a comment to ${project_url}`,
          expectedUpdateLabelsCount: 0
        },
        done
      );
    });
  });
});
