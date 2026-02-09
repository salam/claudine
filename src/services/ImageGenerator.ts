import { IPlatformAdapter } from '../platform/IPlatformAdapter';
import { StorageService } from './StorageService';
import { MAX_IMAGE_PROMPT_LENGTH } from '../constants';

export class ImageGenerator {
  constructor(
    private readonly _storageService: StorageService,
    private readonly _platform: IPlatformAdapter
  ) {}

  public async generateIcon(
    conversationId: string,
    title: string,
    description: string
  ): Promise<string | undefined> {
    const apiType = this._platform.getConfig<string>('imageGenerationApi', 'none');

    if (apiType === 'none') {
      return undefined;
    }

    const apiKey = await this._platform.getSecret('imageGenerationApiKey') ?? '';
    if (!apiKey) {
      console.warn('Claudine: Image generation API key not configured');
      return undefined;
    }

    try {
      // Generate a prompt for the image
      const imagePrompt = this.createImagePrompt(title, description);

      let iconData: string | undefined;

      switch (apiType) {
        case 'openai':
          iconData = await this.generateWithOpenAI(imagePrompt, apiKey);
          break;
        case 'stability':
          iconData = await this.generateWithStability(imagePrompt, apiKey);
          break;
        default:
          return undefined;
      }

      if (iconData) {
        // Save the icon
        await this._storageService.saveIcon(conversationId, iconData);
        return iconData;
      }

      return undefined;
    } catch (error) {
      console.error('Claudine: Error generating icon', error);
      return undefined;
    }
  }

  private createImagePrompt(title: string, description: string): string {
    // Create prompt for best possible thumbnail
    const context = `${title}. ${description}`.slice(0, MAX_IMAGE_PROMPT_LENGTH);

    return `Imagine you have to do a poster thumbnail for a task in a task list that is described like: ${context}.

- show only one illustration and don't split-screen it into four, two. Only one.
- Suitable for a software development task icon. 
- Use completely different styles: photorealistic, comics from different decades or hugely different color palettes.
- Understandable, expressive, distinguishable and unique. Different ideas.
- 128x128 pixels.`;
  }

  private async generateWithOpenAI(
    prompt: string,
    apiKey: string
  ): Promise<string | undefined> {
    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: prompt,
          n: 1,
          size: '1024x1024',
          quality: 'low',
          output_format: 'webp',
          output_compression: 80
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json() as {
        data: Array<{ b64_json: string }>;
      };

      if (data.data && data.data[0]?.b64_json) {
        return `data:image/webp;base64,${data.data[0].b64_json}`;
      }

      return undefined;
    } catch (error) {
      console.error('Claudine: OpenAI image generation failed', error);
      return undefined;
    }
  }

  private async generateWithStability(
    prompt: string,
    apiKey: string
  ): Promise<string | undefined> {
    try {
      const response = await fetch(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            text_prompts: [
              {
                text: prompt,
                weight: 1
              }
            ],
            cfg_scale: 7,
            height: 1024,
            width: 1024,
            samples: 1,
            steps: 30
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Stability API error: ${response.status}`);
      }

      const data = await response.json() as {
        artifacts: Array<{ base64: string }>;
      };

      if (data.artifacts && data.artifacts[0]?.base64) {
        return `data:image/png;base64,${data.artifacts[0].base64}`;
      }

      return undefined;
    } catch (error) {
      console.error('Claudine: Stability image generation failed', error);
      return undefined;
    }
  }

  // Generate a deterministic placeholder icon based on the conversation ID
  public generatePlaceholderIcon(conversationId: string, category: string): string {
    const colors: Record<string, string> = {
      'bug': '#ef4444',
      'user-story': '#3b82f6',
      'feature': '#10b981',
      'improvement': '#f59e0b',
      'task': '#6b7280'
    };

    const color = colors[category] || '#6b7280';

    // Generate a unique pattern based on conversation ID
    const hash = this.hashString(conversationId);
    const pattern = this.generatePattern(hash);

    return `data:image/svg+xml,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <rect width="64" height="64" fill="${color}" opacity="0.1"/>
        ${pattern}
      </svg>
    `.trim())}`;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private generatePattern(hash: number): string {
    const shapes: string[] = [];
    const color = `hsl(${hash % 360}, 60%, 50%)`;

    // Generate a few geometric shapes based on the hash
    const numShapes = 3 + (hash % 3);

    for (let i = 0; i < numShapes; i++) {
      const shapeType = (hash + i) % 3;
      const x = 10 + ((hash * (i + 1)) % 44);
      const y = 10 + ((hash * (i + 2)) % 44);
      const size = 8 + ((hash * (i + 3)) % 12);

      switch (shapeType) {
        case 0: // Circle
          shapes.push(`<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${color}" opacity="0.7"/>`);
          break;
        case 1: // Rectangle
          shapes.push(`<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${color}" opacity="0.7"/>`);
          break;
        case 2: // Triangle
          shapes.push(`<polygon points="${x},${y - size / 2} ${x + size / 2},${y + size / 2} ${x - size / 2},${y + size / 2}" fill="${color}" opacity="0.7"/>`);
          break;
      }
    }

    return shapes.join('\n');
  }
}
