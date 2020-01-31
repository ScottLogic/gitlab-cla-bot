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

  const bot_name = "gitlab-cla-bot";
  const project_id = "1234";
  const web_url = "http://foo.com/user/testproject";
  const merge_request_id = "5";
  const MR_sha = "test_sha";
  const project_url = `${web_url}/merge_requests/${merge_request_id}`;
  const bot_config = {
    label: "test_bot_label",
    recheckComment: "test_recheck_comment",
    message: "test_message {{usersWithoutCLA}} with_substitute_item",
    messageMissingEmail:
      "test_message_missing_email {{unidentifiedUsers}} with_substitute_item",
    contributors: ["test_username"]
  };

  beforeEach(() => {
    // Depending on the order Jasmine runs the tests other modules may be mocking these
    mock.stop("../src/committerFinder");
    mock.stop("../src/contributionVerifier");

    requests = {};

    // a standard event input for the lambda
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
          iid: merge_request_id
        }
      }
    };

    // remove the cached dependencies so that new mocks can be injected
    Object.keys(require.cache).forEach(key => {
      delete require.cache[key];
    });
  });

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

  it("should successfully recognise if all users have signed the CLA", done => {
    // Retrieve MR information
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id}`
    ] = {
      body: {
        sha: MR_sha,
        labels: [bot_config.label]
      }
    };

    // Retrieve the .clabot file
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/repository/files/%2Eclabot/raw?ref=master`
    ] = {
      body: bot_config
    };

    // Get the labels for the project
    requests[`https://gitlab.com/api/v4/projects/${project_id}/labels`] = {
      body: [bot_config.label]
    };

    // Get the commits
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id}/commits`
    ] = {
      body: [
        {
          author_email: "test_user_email",
          author_name: "test_name"
        }
      ]
    };

    // Get the user info
    requests["https://gitlab.com/api/v4/users?search=test_user_email"] = {
      body: [
        {
          username: "test_username"
        }
      ]
    };

    // Set the commit status
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/statuses/${MR_sha}`
    ] = {
      verifyRequest: opts => {
        expect(opts.body.state).toEqual("success");
        expect(opts.body.context).toEqual(bot_name);
      }
    };

    mock("request", mockMultiRequest(requests));

    const lambda = require("../src/index.js");
    adaptedLambda(lambda.Handler)(event, {}, (err, result) => {
      expect(err).toBeNull();
      expect(result.message).toEqual(
        `Updated commit status and added label ${bot_config.label} to ${project_url}`
      );
      done();
    });
  });

  it("should successfully recognise if any users have not signed the CLA", done => {
    // Retrieve MR information
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id}`
    ] = {
      body: {
        sha: MR_sha,
        labels: [bot_config.label]
      }
    };

    // Retrieve the .clabot file
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/repository/files/%2Eclabot/raw?ref=master`
    ] = {
      body: bot_config
    };

    // Get the labels for the project
    requests[`https://gitlab.com/api/v4/projects/${project_id}/labels`] = {
      body: [bot_config.label]
    };

    // Get the commits
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id}/commits`
    ] = {
      body: [
        {
          author_email: "test_user_email",
          author_name: "test_name"
        },
        {
          author_email: "invalid_test_user_email",
          author_name: "invalid_test_name"
        }
      ]
    };

    // Get the both users info
    requests["https://gitlab.com/api/v4/users?search=test_user_email"] = {
      body: [
        {
          username: "test_username"
        }
      ]
    };
    requests[
      "https://gitlab.com/api/v4/users?search=invalid_test_user_email"
    ] = {
      body: [
        {
          username: "invalid_test_username"
        }
      ]
    };

    // Add the comment
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id}/notes`
    ] = {
      verifyRequest: opts => {
        expect(opts.body.body).toEqual(
          bot_config.message.replace(
            "{{usersWithoutCLA}}",
            "@invalid_test_username"
          )
        );
      }
    };

    // Remove the label
    requests[
      `PUT-https://gitlab.com/api/v4/projects/${project_id}/merge_requests/${merge_request_id}`
    ] = {
      verifyRequest: opts => {
        expect(opts.body.labels.length).toEqual(0);
      }
    };

    // Set the commit status
    requests[
      `https://gitlab.com/api/v4/projects/${project_id}/statuses/${MR_sha}`
    ] = {
      verifyRequest: opts => {
        expect(opts.body.state).toEqual("failed");
        expect(opts.body.context).toEqual(bot_name);
      }
    };

    mock("request", mockMultiRequest(requests));

    const lambda = require("../src/index.js");
    adaptedLambda(lambda.Handler)(event, {}, (err, result) => {
      expect(err).toBeNull();
      expect(result.message).toEqual(
        `CLA has not been signed by users @invalid_test_username, added a comment to ${project_url}`
      );
      done();
    });
  });
});
