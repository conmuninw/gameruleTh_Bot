// middleware/facebookAuth.js
const verifyRequestSignature = (req, res, buf) => {
  const signature = req.headers['x-hub-signature-256'];
  
  if (!signature) {
    throw new Error('ไม่มี signature');
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', process.env.APP_SECRET)
    .update(buf)
    .digest('hex');
    
  if (signature !== `sha256=${expectedSignature}`) {
    throw new Error('Signature ไม่ถูกต้อง');
  }
};

const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
};

module.exports = { verifyRequestSignature, verifyWebhook };