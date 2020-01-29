const mock = require("mock-require");

const noop = () => {};

console.info = noop;

const mockRequest = ({ error, response, body, verifyRequest = noop }) => (
  opts,
  cb
) => {
  verifyRequest(opts, cb);
  cb(error, response, body);
};

// mock multiple requests, mapped by URL and method
const mockMultiRequest = config => (opts, cb) => {
  const url =
    (opts.method == "PUT" ? "PUT-" : "") +
    opts.url +
    (opts.qs
      ? "?" +
        Object.keys(opts.qs)
          .map(k => `${k}=${opts.qs[k]}`)
          .join("=") // eslint-disable-line
      : "");
  if (config[url]) {
    return mockRequest(config[url])(opts, cb);
  } else {
    console.error(`No mock found for request ${url}`);
    fail(`No mock found for request ${url}`);
    return {};
  }
};

describe("lambda function", () => {
  let event = {};
  let requests = {};
  let statusSetAttempts = 0;
  let addRecheckCommentsAttempts = 0;
  let addLabelAttempts = 0;

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
    recheckComment: "test_recheck_comment"
  };

  const user_to_verify = { name: "distictUserToVerify" };
  const commitersToFind = {
    unresolvedLoginNames: [],
    distinctUsersToVerify: [user_to_verify]
  };

  const dummyVerifier = usersToVerify =>
    usersToVerify.filter(u => u.name != user_to_verify.name);

  beforeEach(() => {
    statusSetAttempts = 0;
    addRecheckCommentsAttempts = 0;
    addLabelAttempts = 0;

    // a standard event input for the lambda
    event = {
      body: {
        object_kind: "note",
        project: {
          id: project_id,
          web_url: web_url
        },
        merge_request: {
          iid: merge_request_id
        },
        object_attributes: {
          noteable_type: noteable_type,
          note: note
        }
      }
    };

    // Setup default mocks. These would drive the system through its happy path where everyone has signed the CLA.
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id}`
    ] = {
      body: {
        sha: MR_sha,
        labels: [bot_config.label]
      }
    };

    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/repository/files/%2Eclabot/raw?ref=master`
    ] = {
      body: bot_config
    };

    requests[`https://gitlab.com/api/v4/projects/${project_id}/labels`] = {
      body: [bot_config.label]
    };

    setupExpectedStatusUpdate("success");
    setupAddRecheckComment();

    // remove the cached dependencies so that new mocks can be injected
    Object.keys(require.cache).forEach(key => {
      delete require.cache[key];
    });
  });

  const setupAddRecheckComment = () => {
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id}/notes`
    ] = {
      verifyRequest: opts => {
        expect(opts.body.body).toEqual(bot_config.recheckComment);
        addRecheckCommentsAttempts++;
      }
    };
  };

  const setupExpectedLabelCreation = labels => {
    requests[
      `PUT-https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id}`
    ] = {
      verifyRequest: opts => {
        let arrayEquality =
          labels.length == opts.body.labels.length &&
          labels.every((value, index) => value === opts.body.labels[index]);
        expect(arrayEquality).toEqual(true);
        addLabelAttempts++;
      }
    };
  };

  const setupExpectedStatusUpdate = status => {
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/statuses/${MR_sha}`
    ] = {
      verifyRequest: opts => {
        expect(opts.body.state).toEqual(status);
        expect(opts.body.context).toEqual(bot_name);
        statusSetAttempts++;
      }
    };
  };

  const setupMockDependancies = () => {
    mock("../src/committerFinder", () => commitersToFind);
    mock("../src/contributionVerifier", () => dummyVerifier);
    mock("request", mockMultiRequest(requests));
  };

  // TODO: Test X-GitHub-Event header is a pull_request type

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

  /*********************** TEST CASES ***********************/

  it("should ignore events with an unknown object kind", done => {
    event.body.object_kind = "invalid_object_kind";

    const lambda = require("../src/index.js");
    adaptedLambda(lambda.Handler)(event, {}, (err, result) => {
      expect(err).toBeNull();
      expect(result.message).toEqual(
        "ignored action of type invalid_object_kind"
      );
      done();
    });
  });

  it("should ignore note events with an invalid noteable type", done => {
    event.body.object_attributes.noteable_type = "invalid_noteable";

    const lambda = require("../src/index.js");
    adaptedLambda(lambda.Handler)(event, {}, (err, result) => {
      expect(err).toBeNull();
      expect(result.message).toEqual("ignored action of type note");
      done();
    });
  });

  describe("HTTP issues", () => {
    it("should handle http error response to get merge request call", done => {
      requests[
        `https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id}`
      ] = {
        response: {
          statusCode: 403
        }
      };

      setupMockDependancies();

      const lambda = require("../src/index.js");
      adaptedLambda(lambda.Handler)(event, {}, err => {
        expect(err).toEqual(
          `Error: API request https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id} failed with status 403`
        );
        done();
      });
    });
  });

  describe("clabot configuration resolution", () => {
    it("should detect a malformed clabot file and set commit status", done => {
      requests[
        `https://gitlab.com/api/v4/projects/${project_id}/repository/files/%2Eclabot/raw?ref=master`
      ] = {
        body: "I am not JSON"
      };

      setupExpectedStatusUpdate("failed");
      setupMockDependancies();

      const lambda = require("../src/index.js");
      adaptedLambda(lambda.Handler)(event, {}, err => {
        expect(err).toEqual("Error: The .clabot file is not valid JSON");
        expect(statusSetAttempts).toEqual(1);
        done();
      });
    });
  });

  describe("all contributers have signed functionality", () => {
    it("should add comment and set commit status if object_type is note", done => {
      event.body.object_kind = "note";
      setupMockDependancies();

      const lambda = require("../src/index.js");
      adaptedLambda(lambda.Handler)(event, {}, (err, result) => {
        expect(err).toBeNull();
        expect(result.message).toEqual(
          `Updated commit status and added label ${bot_config.label} to ${project_url}`
        );
        expect(statusSetAttempts).toEqual(1);
        expect(addRecheckCommentsAttempts).toEqual(1);
        done();
      });
    });

    it("should set commit status but not add comment if object_type is merge_request", done => {
      event.body.object_kind = "merge_request";
      event.body.object_attributes.iid = merge_request_id;
      setupMockDependancies();

      const lambda = require("../src/index.js");
      adaptedLambda(lambda.Handler)(event, {}, (err, result) => {
        expect(err).toBeNull();
        expect(result.message).toEqual(
          `Updated commit status and added label ${bot_config.label} to ${project_url}`
        );
        expect(statusSetAttempts).toEqual(1);
        expect(addRecheckCommentsAttempts).toEqual(0);
        done();
      });
    });

    it("should not attempt to add the bot label to the MR if it already exists", done => {
      setupExpectedLabelCreation([bot_config.label]);
      setupMockDependancies();

      const lambda = require("../src/index.js");
      adaptedLambda(lambda.Handler)(event, {}, (err, result) => {
        expect(err).toBeNull();
        expect(result.message).toEqual(
          `Updated commit status and added label ${bot_config.label} to ${project_url}`
        );
        expect(addLabelAttempts).toEqual(0);
        done();
      });
    });

    it("should append the bot label to an MR if it hasn't already been added", done => {
      requests[
        `https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id}`
      ] = {
        body: {
          sha: MR_sha,
          labels: ["dummy_label"]
        }
      };

      setupExpectedLabelCreation(["dummy_label", bot_config.label]);
      setupMockDependancies();

      const lambda = require("../src/index.js");
      adaptedLambda(lambda.Handler)(event, {}, (err, result) => {
        expect(err).toBeNull();
        expect(result.message).toEqual(
          `Updated commit status and added label ${bot_config.label} to ${project_url}`
        );
        expect(addLabelAttempts).toEqual(1);
        done();
      });
    });
  });
});
