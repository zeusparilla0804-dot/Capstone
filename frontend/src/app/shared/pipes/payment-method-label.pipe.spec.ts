import { PaymentMethodLabelPipe } from './payment-method-label.pipe';

describe('PaymentMethodLabelPipe', () => {
  const pipe = new PaymentMethodLabelPipe();

  it('displays known GCash storage aliases consistently', () => {
    for (const method of ['gcash', 'GCash', 'e-wallet', 'E-WALLET', 'E_WALLET', 'e_wallet', 'E WALLET']) {
      expect(pipe.transform(method)).toBe('GCash');
    }
  });

  it('formats the existing bank transfer and cash options without modifying values', () => {
    expect(pipe.transform('BANK_TRANSFER')).toBe('Bank transfer');
    expect(pipe.transform('bank-transfer')).toBe('Bank transfer');
    expect(pipe.transform('CASH')).toBe('Cash');
    expect(pipe.transform(undefined)).toBe('Not recorded');
    expect(pipe.transform('')).toBe('Not recorded');
  });

  it('does not rename unrelated wallet providers', () => {
    for (const method of ['Maya', 'PayPal', 'OTHER_E_WALLET', 'E-wallet (Maya)']) {
      expect(pipe.transform(method)).toBe(method);
    }
  });
});
