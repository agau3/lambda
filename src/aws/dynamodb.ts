import { DynamoDB } from "aws-sdk";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import { STS, Credentials } from 'aws-sdk';
import { requireProperty } from "../util/conf";
import logger from '@nmg/osp-backend-utils/logger';

const CROSS_ACCOUNT_ROLE = requireProperty('CROSS_ACCOUNT_DYNAMO_ROLE')
const sts = new STS();

async function fetchCredentials() {
    try {
        return await sts.assumeRole({
            RoleArn: CROSS_ACCOUNT_ROLE,
            RoleSessionName: 'cross-account'
        }).promise();
    } catch (error) {
        console.warn(`error getting tokens: ${error.toString()}`);
        throw error;
    }
}

async function dynamodbMapper(){
    const creds = await fetchCredentials();
    logger.debug({message:`credentials - ${JSON.stringify(creds)}`});
    const credentials = new Credentials({
      accessKeyId: creds.Credentials.AccessKeyId,
      secretAccessKey: creds.Credentials.SecretAccessKey,
      sessionToken: creds.Credentials.SessionToken
    });
    const mapper = new DataMapper({ client: new DynamoDB({credentials}) });
    return mapper;
}

export {dynamodbMapper, fetchCredentials}