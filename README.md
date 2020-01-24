# gitlab-cla-bot

Pre-requisites:
- AWS account
- gitlab repo & access to it

Set-up:
- Get a personal access token for the repo you wish to run against
- Set the variable `gitlabToken` in index.js to your gitlab personal access token
- install and run the AWS sdk locally to create a node_modules in src

To deploy manually
- zip the contents of src
- create a lambda in the AWS console
- upload your zip file as lambda content
- create an open API gateway, set it to receive POST requests, and note down the endpoint given

To deploy using serverless:
- install serverless (available via npm and choco)
- set up an appropriate IAM user in your AWS account and obtain a key and secret
- set up AWS credentials locally with 
`serverless config credentials --provider aws --key AKIAIOSFODNN7EXAMPLE --secret wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`
See the guide at https://serverless.com/framework/docs/providers/aws/guide/credentials/ for more detail and alternative ways to do this
- Run serverless deploy and note down the endpoint given

To hook into Gitlab:
- Go to Settings->Integrations in Gitlab
- Add a new webhook triggered by `Comments` and `Merge request events`. Hook URL should be the endpoint you've noted down. Untick security options
- Click Test->`Note events` or `Merge requests events`
- Result should appear at the top of the page

Security is a TODO...