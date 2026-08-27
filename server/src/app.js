'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Behind a reverse proxy in production, so req.ip and secure cookies work.
if (env.isProduction) app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(helmet());

// The client sends the refresh cookie, so the origin must be explicit —
// credentialed requests cannot use a wildcard.
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));

app.use(env.apiPrefix, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
