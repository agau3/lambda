import * as cmosDataMapper from '../../tasks/cmosOrderDataMapper'
import * as testData from '../data/cmosTestData'

describe('cmos data mapper test', () => {

    test('Test buildCmosOrderDetails', async () => {
        let OrderDetails = cmosDataMapper.buildOrderDetails(testData.processOrderPayload);
    })

    test('Test buildCmosOrderItemDetails', async () => {
        let ItemDetails = cmosDataMapper.buildOrderItemDetails(testData.processOrderPayload);
    })

    test('Test readKinesisStream', async () => {
        let totalAmount = cmosDataMapper.calculateTotalAmount(testData.processOrderPayload);
    })

    test('Test formatOrderDate', async () => {
        let reponse = cmosDataMapper.formatOrderDate(testData.processOrderPayload.eboPayload.OrderOut.orderHeader.orderDate);
        expect(reponse).toEqual('2020-04-12')
    })
})