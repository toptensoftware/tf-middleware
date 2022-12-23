import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import cors from 'cors';
import { localPath, expressErrorHandler } from '@toptensoftware/nodelib';
import { tfMiddleware } from './tfMiddleware.js';

// Create app
const app = express();
app.use("/", express.static(localPath(import.meta.url, "public")));
app.use(morgan('tiny', {
    skip: (req) => req.skipLog
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 
app.use(bodyParser.text());
app.use(cors({
    origin: '*',
    credentials: true,
}));

// Api
app.use('/api/detect', tfMiddleware({
    posenetOptions: { maxDetections: 20 }
}));

// Error handler
app.use(expressErrorHandler)

// Start server
const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`listening on ${port}`);
}); 

