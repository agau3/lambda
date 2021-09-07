import logger from '@nmg/osp-backend-utils/logger';
import * as awsDynamodb from "../aws/dynamodb";
import { CmosOrder } from '../dto/cmosOrder';
import * as associateOnlineSale from '../storage/onlineSaleAction';
import * as objectMapper from '../tasks/onlineSaleDataMapper';
import { KinesisStreamEvent } from 'aws-lambda';
import { base64decode } from 'nodejs-base64';
import { isEmpty } from "lodash";
import { DataMapper } from '@aws/dynamodb-data-mapper';

export async function readCmosKinesisStream(event: KinesisStreamEvent) {
    logger.info({ message: 'Start CMOS ReadKinesisStream' });
    logger.debug({ message: 'CMOS Order Event Feed', data: JSON.stringify(event) });
    const ddbMapper = await awsDynamodb.dynamodbMapper();
    for (const record of event.Records) {
        try {
            if (!record.kinesis.data) {
                logger.error('Missing data.');
            }
            let result = base64decode(record.kinesis.data);
            if (result.hasErrors) {
                logger.error({ message: 'There are errors while parsing CMOS Order Feed - kinesis stream...', data: result.errors });
            }
            await processOrder(result, ddbMapper);
        } catch (error) {
            logger.error({ message: error });
        }
    }
}

export async function processOrder(input: any, ddbMapper: DataMapper) {
    logger.info({ message: 'Start ProcessOrder() 1' });
    try{
        var payload: CmosOrder = JSON.parse(input)
        logger.debug({ message: 'CMOS OnlineSale Payload.', data: payload });
        logger.info({ message: 'Build Online Sale Action Details()' });
        let associateOnlineSaleList = await objectMapper.buildOnlineSaleDetails(payload);
        if (associateOnlineSaleList.length > 0 && !isEmpty(associateOnlineSaleList) && associateOnlineSaleList != undefined) {
            associateOnlineSaleList.sort((a, b) => (a.actionKey > b.actionKey) ? 1 : -1)
            logger.debug({ message: 'Sorted associateOnlineSaleList List', data: associateOnlineSaleList });
            let listSize = associateOnlineSaleList.length;
            logger.debug({ message: 'listSize', data: listSize});
            
            let onlineSaleActionsToSave: { [key: string]: associateOnlineSale.CmosAssociateOnlineSale } = {};

            for(const currentOnlineSaleAction of associateOnlineSaleList) {
                let onlineSaleActionKey = currentOnlineSaleAction.associatePin + "_" + currentOnlineSaleAction.actionKey;
                const existingOnlineSaleAction = onlineSaleActionsToSave[onlineSaleActionKey];

                if (existingOnlineSaleAction===undefined || existingOnlineSaleAction===null || Object.keys(existingOnlineSaleAction).length===0){
                    onlineSaleActionsToSave[onlineSaleActionKey] = currentOnlineSaleAction;
                }else {
                    logger.debug({ message: `currentOnlineSaleAction 2 : ${currentOnlineSaleAction}`});
                    if (JSON.stringify(existingOnlineSaleAction) === JSON.stringify(currentOnlineSaleAction)){
                        logger.debug({ message:`Excluded duplicate of line item action for associatePin \"${currentOnlineSaleAction.associatePin}\" and actionKey \"${currentOnlineSaleAction.actionKey}\".`});
                    } else {
                        logger.debug({ message:`Line item action for associatePin \"${currentOnlineSaleAction.associatePin}\" and actionKey \"${currentOnlineSaleAction.actionKey}\" already exists in list to save and isn't equal to the current.\n"
                            + Old:  ${existingOnlineSaleAction} + "\n"
                            + Current:  ${currentOnlineSaleAction} + "\n"
                            + Only the old one will be stored.`});
                    }
                }
            };

            logger.debug({ message: 'onlineSaleActionsToSave', data: onlineSaleActionsToSave});
            let listToSaveSize = Object.values(onlineSaleActionsToSave).length;
            logger.debug({ message: 'listToSaveSize', data: listToSaveSize});

            if (listToSaveSize > 0) {
                if (listToSaveSize == listSize) {
                    logger.info({ message:`Found ${listSize} Line items with shipped or returned status`});
                } else {
                    logger.info({ message:`Found ${listSize} line items with shipped or returned status, ${(listSize - listToSaveSize)} were removed as duplicates`});
                }
                let onlineSaleActionList : associateOnlineSale.CmosAssociateOnlineSale[] = [];
                for(let value of Object.values(onlineSaleActionsToSave)) {
                    onlineSaleActionList.push(value);
                }
                logger.debug({ message: 'Final OnlineSalesAction List', data: onlineSaleActionList });
                await associateOnlineSale.batchWrite(onlineSaleActionList, ddbMapper);
                logger.info({ message: 'Successfully persisted Associate Online Sales Action Data!!!' });
            }
        }
    } catch (error) {
        logger.error({ message: 'Error processing the CMOS order feed', data: error });
        throw new Error(error);
    }
}