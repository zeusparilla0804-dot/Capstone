import { TestBed } from '@angular/core/testing';
import { CustomerAccountScopeService } from './customer-account-scope.service';

describe('CustomerAccountScopeService', () => {
  it('synchronously invalidates stores only when the principal changes', () => {
    const scope = TestBed.inject(CustomerAccountScopeService);
    const generations: number[] = [];
    scope.changes.subscribe(() => generations.push(scope.generation));
    scope.setPrincipal(null);
    scope.setPrincipal('42');
    expect(generations).toEqual([1]);
    scope.setPrincipal('42');
    expect(generations).toEqual([1]);
    scope.setPrincipal('7');
    scope.setPrincipal(null);
    expect(generations).toEqual([1, 2, 3]);
  });
});
