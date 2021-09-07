import { ssmParameter} from 'aws-parameter-cache';
import { Parameter } from 'aws-parameter-cache/lib/parameter';
import logger from '@nmg/osp-backend-utils/logger';

const SSM_PARAMS: {[key: string]: Parameter} = {}

/**
 * property has name and value permanent per deployment
 * property is environment variable
 * 
 * @param name name of environment variable to get
 * @throws Error if no such environment variable exist
 */
export function requireProperty(name: string): string {
  const value = process.env[name]

  if (!value) {
    const message = `required environment variable '${name}' is not defined`
    logger.error(message)
    throw new Error(message)
  }

  return value
}

const PREFIX = process.env['NODE_ENV'] === 'test' ?
  'test' :
  `/${requireProperty('SERVICE_NAME')}/${requireProperty('STAGE')}`

/**
 * parameter is imported configuration
 * parameter value may be encrypted
 * all parameters are stored within SSM parameter store
 * 
 * @param paramName name of parameter
 * @param WithDecryption if true, then unencrypted value will be in response
 */
export async function requireParameter(paramName: string, WithDecryption: boolean = false): Promise<string> {
  const Name: string = `${PREFIX}/${paramName}`
  if (!(Name in SSM_PARAMS)) {
    let param
    try {
      param = ssmParameter({name: Name, withDecryption: WithDecryption, maxAge: 10 * 60 * 1000})
    } catch(error) {
      const message = `unable to retrieve parameter ${Name} from SSM: ${error.toString()}`
      logger.error(message)
      throw new Error(message)
    }
    SSM_PARAMS[Name] = param
  }
  if (!SSM_PARAMS[Name]) {
    throw new Error(`parameter ${Name} does not exist in SSM`)
  }
  const value = SSM_PARAMS[Name].value
  if (!value) {
    throw new Error(`parameter ${Name} does not have a value`)
  } 
  return value as Promise<string>
}
