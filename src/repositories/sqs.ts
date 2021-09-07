import { SQS } from 'aws-sdk';
import logger from '@nmg/osp-backend-utils/logger';
import { property } from '@nmg/osp-backend-utils/config';
import { SendMessageRequest } from 'aws-sdk/clients/sqs';

const POS_RETRY_QUEUE_URL = property('POS_RETRY_QUEUE_URL');
const POS_DLQ_URL = property('POS_DEAD_LETTER_QUEUE_URL');
const MAX_RETRY_ATTEMPTS = +property('MAX_RETRY_ATTEMPTS');

export class SQSRepository {
    private readonly sqs = new SQS();
    private async sendMessage(retryQueueUrl: string, dlqUrl: string, message: string, messageType: string, failureReason: string, retryFailCount: number = 0, delaySec?: number) {
        let targetQueueUrl = '';
        let nextRetryCount = 0;
        if (retryFailCount < MAX_RETRY_ATTEMPTS) {
            targetQueueUrl = retryQueueUrl;
            nextRetryCount = retryFailCount + 1;
        } else {
            targetQueueUrl = dlqUrl;
            nextRetryCount = MAX_RETRY_ATTEMPTS;
        }
        logger.debug({ message: 'Posting POS stringfyied payload message to queue', targetQueueUrl, messageType, failureReason, retryCount: retryFailCount, nextRetryCount, delaySec, data: message });
        const messageRequest = {
            MessageBody: message,
            QueueUrl: targetQueueUrl,
            MessageAttributes: {
                messageType: {
                    DataType: 'String',
                    StringValue: messageType
                },
                retryFailCount: {
                    DataType: 'Number',
                    StringValue: `${nextRetryCount}`
                },
                failureReason: {
                    DataType: 'String',
                    StringValue: failureReason
                }
            },
        } as SendMessageRequest;
        if (delaySec) {
            messageRequest.DelaySeconds = delaySec;
        }
        let resp = null;
        try {
            logger.debug({message: "Pre SendMessage", data: messageRequest});
            resp = await this.sqs.sendMessage(messageRequest).promise();
            logger.debug({message: "Post SendMessage", data: resp});
        } catch (error) {
            logger.error({ message: `Unable to move failed message to queue ${error}`, targetQueueUrl, messageType, failureReason, retryFailCount: nextRetryCount, delaySec });
            throw new Error(error);
        }
        return resp;
    }

    async putOSPFailedMessage(message: string, messageType: string, failureReason: string, retryAttempt: number = 0) {
        return this.sendMessage(POS_RETRY_QUEUE_URL, POS_DLQ_URL, message, messageType, failureReason, retryAttempt);
    }
}