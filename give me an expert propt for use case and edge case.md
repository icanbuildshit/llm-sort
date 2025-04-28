<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" class="logo" width="120"/>

# give me an expert propt for use case and edge case research and solutions

Here's an expert-crafted prompt for rigorous use case/edge case research and solution design, incorporating rollback points, flexibility, and quality controls:

---

## Advanced Use Case \& Edge Case Research Protocol

**Role:**
You are a senior systems analyst and solution architect. Your task is to systematically identify, validate, and resolve edge cases while maintaining core functionality.

---

### 1. **Use Case Definition Framework**

1. **Core Function Identification**
    - List essential system functions with priority rankings
    - Example:

```markdown
1. User authentication (P0)
2. Call recording storage (P1)
3. Real-time call analytics (P2)
```

2. **Primary Use Case Expansion**
    - For each function:
        - Define 3 normal workflows
        - Identify 2 variant workflows
        - Example for authentication:

```python
# Normal flow
def authenticate(user, password):
    if valid_credentials(user, password):
        grant_access() # [^1][^4]
    else:
        deny_access()

# Variant flow
def oauth_authenticate(provider_token):
    validate_third_party(provider_token) # [^2][^6]
```


---

### 2. **Edge Case Exploration Process**

**Iterative Identification:**

1. **First-Pass Analysis**
    - For each use case:
        - Identify 5-7 boundary conditions
        - Flag 3-5 exception paths
        - Example:

```markdown
Authentication Edge Cases:
- Concurrent login attempts
- Expired password during call
- MFA timeout mid-call [^4][^7]
```

2. **Second-Pass Validation**
    - Cross-reference with:
        - Historical incident reports
        - Similar system postmortems
        - Regulatory requirements[^5][^6]
3. **Risk Matrix Development**


| Edge Case | Probability | Impact | Mitigation Strategy |
| :-- | :-- | :-- | :-- |
| DB failover during call | Low | Critical | Active-active replication[^3][^4] |


---

### 3. **Solution Development Checklist**

**Robust Implementation Requirements:**

1. Input validation guards

```python
def validate_phone_number(number):
    if not re.match(r'^\+?[1-9]\d{1,14}$', number):
        raise InvalidNumberFormat # [^4][^8]
```

2. Circuit breaker pattern

```python
with CircuitBreaker(
    failure_threshold=5, 
    recovery_timeout=30
) as cb: # [^3][^4]
    api_call()
```

3. Rollback-ready deployments
    - Versioned database migrations
    - Feature flag controls
    - Automated rollback triggers[^1][^6]

---

### 4. **Quality Assurance Gates**

**Validation Sequence:**

1. **Pre-Implementation Checks**
    - [ ] Threat modeling complete
    - [ ] Data flow diagrams updated
2. **Post-Implementation Verification**

```gherkin
Scenario: Database failover during active call
  Given 2 active database nodes
  When Primary node fails
  Then Call continues uninterrupted
  And Call metadata persists [^3][^4]
```

3. **Monitoring Requirements**
    - 95th percentile latency metrics
    - Error budget tracking
    - Automated alert escalation[^5][^8]

---

## Solution Template

```markdown
### [Feature Name] Implementation Blueprint

1. **Core Use Cases**
   - [ ] Standard flow
   - [ ] Alternate flow

2. **Edge Case Matrix**
   - High Risk: [ ]
   - Medium Risk: [ ]

3. **Rollback Plan**
   - Trigger Condition: [ ]
   - Rollback Steps:
     1. [ ]
     2. [ ]

4. **Validation Checklist**
   - [ ] Stress test results
   - [ ] Failure injection test
```


---

This prompt enforces systematic edge case analysis while maintaining solution flexibility through versioned rollbacks, circuit breakers, and real-time monitoring. It combines TDD principles[^4], risk prioritization[^3], and architectural safeguards[^6] for enterprise-grade resilience.

<div style="text-align: center">⁂</div>

[^1]: https://www.looppanel.com/blog/14-chat-gpt-prompts-to-use-for-ux-research

[^2]: https://docsbot.ai/prompts/analysis/edge-case-analysis

[^3]: https://www.qodo.ai/glossary/edge-case-testing/

[^4]: https://algocademy.com/blog/thinking-in-edge-cases-how-to-bulletproof-your-coding-solutions-in-interviews/

[^5]: https://www.uxtweak.com/ux-glossary/edge-case/

[^6]: https://www.linkedin.com/pulse/deep-research-49-business-use-cases-prompts-library-alex-velinov-4bspe

[^7]: https://www.advisory.com/daily-briefing/2023/11/02/ai-roundup

[^8]: https://team-gpt.com/blog/chatgpt-prompts-for-market-research/

[^9]: https://www.reddit.com/r/ChatGPTPromptGenius/comments/1jbyp7a/chatgpt_prompt_of_the_day_the_deep_research_gpt/

[^10]: https://otio.ai/blog/chatgpt-prompts-for-research

[^11]: https://www.promptingguide.ai/introduction/examples

[^12]: https://www.testdevlab.com/blog/manual-testing-tips-for-edge-cases

[^13]: https://www.testscenario.com/what-is-edge-case-testing/

[^14]: https://www.coursera.org/articles/edge-case

[^15]: https://forum.obsidian.md/t/prompts-for-artificial-intelligence-to-analyze-academic-articles/80709

[^16]: https://www.ecr.ai

[^17]: https://www.testdevlab.com/blog/what-is-an-edge-case

[^18]: https://www.reddit.com/r/ADHD_Programmers/comments/zysmb4/how_do_you_plan_for_edge_cases_while_programming/

[^19]: https://en.wikipedia.org/wiki/Edge_case

[^20]: https://www.godofprompt.ai/blog/10-best-grok-3-prompts-for-deep-research

