/**
 * Instagram API Client
 * 
 * Calls the Instagram API (or mock) to fetch data.
 */

export class InstagramClient {
  private baseUrl: string;
  
  constructor(private accessToken: string) {
    this.baseUrl = process.env.INSTAGRAM_API_URL || 'http://localhost:3002';
  }
  
  async getProfile(username: string) {
    const response = await fetch(
      `${this.baseUrl}/v1/users/${username}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      const error: any = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Instagram API error: ${error.error?.message || response.statusText}`);
    }
    
    const result: any = await response.json();
    return result.data;
  }
}
