import * as onlineSaleDataMapper from '../../tasks/onlineSaleDataMapper'
import * as onlineSaleTestData from '../data/onlineSaleTestData'

describe('onlineSales data mapper test', () => {

    test('Test buildOnlineSaleDetails', async () => {
        let OrderDetails = onlineSaleDataMapper.buildOnlineSaleDetails(onlineSaleTestData.processOrderPayload);
    })
})