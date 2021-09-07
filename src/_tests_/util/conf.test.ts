var AWS = require('aws-sdk-mock'); 
AWS.mock('SSM', 'test/integration.accountApi.url', 'https://dev-int-api.nmgcloudapps.com/account-api-sls');
AWS.mock('SSM', 'test/integration.accountApi.apiKey', 'vygDZlKtnu2qd0zQrjkGv9hnb5SvBoac9DkzxoJZ');
import { requireParameter, requireProperty} from '../../util/conf'
import * as config from '../../util/conf'
import * as parmetercache  from 'aws-parameter-cache';
import sinon from 'sinon';
const bluebird = require('bluebird');
import * as awscache from 'aws-parameter-cache';

const configData = {
    accountUrl: "https://dev-int-api.nmgcloudapps.com/account-api-sls",
    accountApiKey: "vygDZlKtnu2qd0zQrjkGv9hnb5SvBoac9DkzxoJZ"
};

beforeEach(() =>{
    Object.defineProperty(parmetercache, 'ssmParameter', {value:jest.fn().mockReturnValue('Hellow')}) 
    // config.parameter = jest.fn().mockImplementationOnce(()=>{
  
    })
describe('Config Test', () => {

    test(`RequireProperty Test Available`, async () => {
        expect(requireProperty('STAGE')).toBe('dev');
    })

    test(`RequireProperty Test Not Available`, async () => {
        let name = 'STAGE1';
        const message = `required environment variable '${name}' is not defined`
        try {
            const newLocal = requireProperty(name);
        } catch (error) {
            expect(error).toStrictEqual(new Error(message))
        }
    })


    test(`RequireParameter From SSM`, async () => {
        AWS.mock('SSM', 'test/STAGE1', 'Stage-test');
        let name = 'STAGE1';
        const message = `parameter test/STAGE1 does not have a value`
        try {
            const newLocal = await requireParameter(name);
        } catch (error) {
            expect(error).toStrictEqual(new Error(message))
        }    
    })

    test(`Test RequireParameter does not exist in SSM`, async () => {
        const message = `parameter test/random does not exist in SSM`
        let ssmStub = sinon.stub(awscache, 'ssmParameter');
        ssmStub.callsFake(() => bluebird.resolve(message));
        try {
            const newLocal = await requireParameter("random");
        } catch (error) {
            expect(error).toStrictEqual(new Error(message))
            ssmStub.restore();
        }    
    })

    test(`Test RequireParameter unable to retrieve parameter`, async () => {
        const message = `unable to retrieve parameter test/random from SSM: test error`
        let ssmStub = sinon.stub(awscache, 'ssmParameter');
        ssmStub.callsFake(() => bluebird.resolve(message));
        try {
            const newLocal = await requireParameter("random");
        } catch (error) {
            expect(error).toStrictEqual(new Error(message))
            ssmStub.restore();
        }    
    })

});
