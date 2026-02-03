
require('dotenv').config();
const app = require('./src/app');
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => console.log(`Backend rodando na porta ${PORT}`));
