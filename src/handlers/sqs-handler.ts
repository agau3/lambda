import logger from '@nmg/osp-backend-utils/logger';
import * as awsDynamodb from "../aws/dynamodb";
import { SQSEvent } from 'aws-lambda';
import { POS_MESSAGE_TYPES } from '../dto/posOrder';
import { processOrder, handleUpdatesRetry } from './posHandler';

export const retryFailedPosUpdates = async (event: SQSEvent): Promise<void> => {
  logger.debug({ message: 'Retrying failed event', event });
  const ddbMapper = await awsDynamodb.dynamodbMapper();
  await Promise.all(event.Records.map(async (record) => {
    const msgType = record.messageAttributes.messageType.stringValue;
    const retryAttempt = +(record.messageAttributes?.retryFailCount.stringValue || 0);
    let message = null;
    try {
      message = record.body;
      switch (msgType) {
        case POS_MESSAGE_TYPES.POS_ORDER_HISTORY_UPDATE:
          await processOrder(message, ddbMapper, retryAttempt);
          break;
      }
    } catch (error) {
      logger.debug({ message: 'Error occurred while retrying failed message...', record });
      logger.error({ message: 'Retry failed.', errorMessage: error.message, msgType });
      if (message) {
        await handleUpdatesRetry(message, msgType, 'Error in lambda execution: ' + error.message, retryAttempt);
      }
    }
  }))
};
