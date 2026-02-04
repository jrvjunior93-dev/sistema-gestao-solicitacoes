const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function uploadToS3(file, folder) {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `${folder}/${Date.now()}-${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype
  });

  await s3.send(command);

  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${command.input.Key}`;
}

function getKeyFromUrl(url) {
  try {
    const bucket = process.env.AWS_S3_BUCKET;
    const parsed = new URL(url);
    if (!parsed.hostname.startsWith(`${bucket}.s3`)) return null;
    return parsed.pathname.replace(/^\\//, '');
  } catch (error) {
    return null;
  }
}

async function getPresignedUrl(urlOrKey, expiresIn = 300) {
  const key = urlOrKey?.startsWith?.('http')
    ? getKeyFromUrl(urlOrKey)
    : urlOrKey;

  if (!key) return urlOrKey;

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key
  });

  return getSignedUrl(s3, command, { expiresIn });
}

module.exports = { uploadToS3, getPresignedUrl };
