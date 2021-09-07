import * as posDataMapper from '../../tasks/posOrderDataMapper'
import * as testData from '../data/posTestData'

describe('pos data mapper test', () => {

    test('Test buildOrderDetails', async () => {
        let orderDetails = posDataMapper.buildOrderDetails(testData.processOrderPayload);
    })

    test('Test generateOriginalOrderNumber', async () => {
        let originalOrderNumber = posDataMapper.generateOriginalOrderNumber(testData.processOrderPayload);
    })

    test('Test getCardDetails', async () => {
        let paymentPayload = testData.paymentData;
        let reponse = posDataMapper.getCardDetails(paymentPayload);
        expect(reponse).toEqual('xxxxxxxxxxxx1004')
    })

    test('Test getCardDetails negative scenario', async () => {
        let paymentPayload = testData.paymantCashData;
        let reponse = posDataMapper.getCardDetails(paymentPayload);
        expect(reponse).toEqual('')
    })

    test('Test generateOriginalOrderNumberReturn', async () => {
        let reponse = posDataMapper.generateOriginalOrderNumberReturn(testData.lineItemData);
        expect(reponse).toEqual('64:194:227:20200206')
    })

    test('Test formatPosDate', async () => {
        let reponse = posDataMapper.formatPosDate(testData.processOrderPayload.eboPayload.OrderOut.orderHeader.orderDate);
        expect(reponse).toEqual('2020-04-13')
    })

    test('Test formatPosDate currentDate', async () => {
        let reponse = posDataMapper.formatPosDate('');
        let expected: string = posDataMapper.getCurrentDate();
        expect(reponse).toEqual(expected)
    })

    test('Test generateOriginalOrderNumber', async () => {
        let reponse = posDataMapper.generateOriginalOrderNumber(testData.processOrderPayload);
        expect(reponse).toEqual("2:194::")
    })

    test('Test formatOrderId', async () => {
        let reponse = posDataMapper.formatOrderId('1:160:451:20200213');
        expect(reponse).toEqual("001/0160/0451/021320")
    })

})