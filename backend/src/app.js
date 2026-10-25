import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'vecdim-backend',
    database: 'not-connected-yet'
  });
});

export default app;
