import { describe, it, expect } from 'vitest';
import { AppError } from './app-error.js';

describe('AppError', () => {
  it('varsayılan statusCode 400 olmalı', () => {
    const err = new AppError('TEST_ERROR', 'Test mesajı');
    expect(err.code).toBe('TEST_ERROR');
    expect(err.message).toBe('Test mesajı');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('AppError');
  });

  it('özel statusCode kabul etmeli', () => {
    const err = new AppError('NOT_FOUND', 'Bulunamadı.', 404);
    expect(err.statusCode).toBe(404);
  });

  it('Error sınıfını extend etmeli', () => {
    const err = new AppError('ERR', 'mesaj');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});
