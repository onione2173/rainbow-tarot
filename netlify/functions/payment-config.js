exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clientId: process.env.NICEPAY_CLIENT_KEY || '',
    sandbox: process.env.NICEPAY_SANDBOX === 'true',
  }),
});
