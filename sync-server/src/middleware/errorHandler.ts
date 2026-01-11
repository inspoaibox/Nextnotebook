import { Request, Response, NextFunction } from 'express';
import { log } from './logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  log('error', 'Error', {
    method: req.method,
    path: req.path,
    statusCode,
    error: err.message,
    stack: err.stack,
  });

  res.status(statusCode).json({
    error: message,
    code: err.code,
  });
}

// 创建带状态码的错误
export function createError(message: string, statusCode: number, code?: string): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
