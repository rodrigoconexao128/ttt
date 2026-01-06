
import { generateSystemPrompt } from './server/promptTemplates';

const mockBusinessConfig = {
  id: '123',
  userId: 'user1',
  agentName: 'Test Agent',
  agentRole: 'Assistant',
  companyName: 'Test Corp',
  personality: 'Friendly',
  productsServices: [],
  businessInfo: {},
  policies: {},
  allowedTopics: [],
  prohibitedTopics: [],
  allowedActions: [],
  prohibitedActions: [],
  toneOfVoice: 'Neutral',
  communicationStyle: 'Direct',
  emojiUsage: 'moderado',
  formalityLevel: 5,
  maxResponseLength: 200,
  useCustomerName: true,
  offerNextSteps: true,
  escalateToHuman: false,
  notificationEnabled: false,
  isActive: true,
  model: 'mistral',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

const mockPromptContext = {
  customerName: 'Rodrigo',
  customInstructions: '!!! THIS IS THE CUSTOM INSTRUCTION THAT WAS MISSING !!!'
};

console.log('--- GENERATING PROMPT ---');
const prompt = generateSystemPrompt(mockBusinessConfig, mockPromptContext);

if (prompt.includes('THIS IS THE CUSTOM INSTRUCTION THAT WAS MISSING')) {
  console.log('✅ SUCCESS: Custom instructions are injected!');
} else {
  console.error('❌ FAILURE: Custom instructions NOT found in prompt.');
}

console.log('--- PROMPT SNIPPET ---');
const idx = prompt.indexOf('INSTRUÇÕES PERSONALIZADAS');
console.log(prompt.substring(idx, idx + 200));
