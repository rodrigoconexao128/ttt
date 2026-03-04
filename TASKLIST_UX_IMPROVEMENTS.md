# Tasklist: Deep UI/UX Improvements for Agent Editor

This tasklist covers the redesign and optimization of the Agent Editor interface, focusing on the chat input experience, mobile responsiveness, and overall layout efficiency as requested.

## UI/UX & Layout Core
1. [ ] **Analyze Layout Structure**: Deep dive into `agent-studio-unified.tsx` flexbox implementation to identify the source of the "white space" gap at the bottom.
2. [ ] **Maximize Vertical Space**: Ensure the chat interface consumes 100% of available vertical height without unnecessary margins.
3. [ ] **Remove Bottom Gap**: Eliminate the dead space below the input area so the interface feels grounded and native.
4. [ ] **Expand Input Area**: Increase the default height of the `Textarea` to be more inviting for complex instructions (min-height ~80px).
5. [ ] **Minimalist Input Design**: Refine the input border, shadow, and background to be cleaner and less "heavy".

## Mobile Responsiveness
6. [ ] **Mobile Layout Audit**: Review behavior on < 768px screens.
7. [ ] **Unsqueeze Mobile View**: Adjust padding and margins on mobile to prevent the "squeezed" feeling.
8. [ ] **Touch Targets**: Ensure the "Send" button and quick actions are easily tappable on mobile (min 44px).
9. [ ] **Keyboard Handling Mobile**: Ensure the virtual keyboard doesn't hide the input field or chat history.
10. **Sidebar Adaptation**: Verify how the sidebar interacts with the chat on mobile (drawer vs hidden).

## Functional Improvements
11. [ ] **Auto-resize Intelligence**: Optimize the Textarea auto-resize behavior to feel smooth.
12. [ ] **Quick Actions Re-placement**: Evaluate if quick action chips (pills) are cluttering the bottom; consider moving or collapsing them.
13. [ ] **Enter vs Shift+Enter**: Verify robust handling of sending vs new lines.
14. [ ] **Loading Feedback**: Ensure the "Applied/Processing" state is clearly visible near the input.
15. [ ] **Scroll Management**: Auto-scroll to bottom functionality when input size changes or keyboard appears.

## Deployment & Verification (MCP)
16. [ ] **Playwright Test - Desktop**: Create a test to verify input visibility and sending.
17. [ ] **Playwright Test - Mobile**: Create a mobile viewport test to check layout constraints.
18. [ ] **Visual Regression**: Take snapshots of the new layout.
19. [ ] **Railway Deployment**: Deploy changes to staging/production on Railway.
20. [ ] **Final UX Polish**: Review transitions and hover states for a "perfect" feel.

## Implementation Steps (Plan)
- [ ] Edit `vvvv/client/src/components/agent-studio-unified.tsx`.
- [ ] Run Playwright tests.
- [ ] Deploy.
