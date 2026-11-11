import { environment } from '../../../environments/environment';
export function catalogImageUrl(value: string): string {
  return value.startsWith('/api/') ? `${environment.apiBaseUrl.replace(/\/api\/?$/, '')}${value}` : value;
}
