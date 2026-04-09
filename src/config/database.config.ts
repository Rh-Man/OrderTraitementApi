import * as AWS from 'aws-sdk';

interface DbCredentials {
  username: string;
  password: string;
}

let cachedCredentials: DbCredentials | null = null;

export async function getDatabaseCredentials(): Promise<DbCredentials> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new Error('DB_SECRET_ARN environment variable is not set');
  }

  const secretsManager = new AWS.SecretsManager();
  
  try {
    const data = await secretsManager.getSecretValue({ SecretId: secretArn }).promise();
    
    if (!data.SecretString) {
      throw new Error('Secret string is empty');
    }

    const secret = JSON.parse(data.SecretString);
    cachedCredentials = {
      username: secret.username,
      password: secret.password,
    };

    return cachedCredentials;
  } catch (error) {
    console.error('Error fetching database credentials:', error);
    console.error('DB_SECRET_ARN:', process.env.DB_SECRET_ARN);
    console.error('AWS_REGION:', process.env.AWS_REGION);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw error;
  }
}
