import 'dotenv/config';
import app from './app.js';

const port = Number(process.env.PORT || 4000);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env, set DATABASE_URL, then start the server again.');
  process.exit(1);
}

app.listen(port, () => {
  console.log(`VECDIM backend listening on port ${port}`);
});
