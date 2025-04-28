<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" class="logo" width="120"/>

## Protogon + VICIdial Unified Portal: Blueprint

This blueprint outlines the architecture, integration points, and step-by-step build for a unified web portal that brings together Protogon’s AI/CRM features with VICIdial’s robust call handling, creating a single, modern agent workspace.

---

### **1. System Architecture Overview**

| Layer | Component | Description/Role |
| :-- | :-- | :-- |
| Frontend | Web App (React/Vue/Angular) | Unified agent dashboard, lead management, dialer |
| API Layer | Custom Backend (Node/Python) | Orchestrates data between portal, VICIdial, CRM |
| Dialer Engine | VICIdial Cluster | Predictive/preview/manual dialing, call routing |
| Data Layer | MySQL (VICIdial), Supabase, etc | Stores leads, call logs, agent stats, AI insights |
| AI/Analytics | Protogon AI Services | Sentiment, coaching, compliance, reporting |


---

### **2. Integration Points**

- **VICIdial APIs**:
    - **Agent API**: Control calls (dial, hangup, transfer, etc.) from your portal[^4][^3].
    - **Non-Agent API**: Manage leads, campaigns, and get call statuses[^4][^3].
- **Custom Webhooks**: For real-time event updates (call status, lead changes).
- **Embedded Agent Screen**: Use iframe or API-driven widgets for VICIdial’s live call controls[^3][^6].
- **CRM/AI**: Protogon modules for lead scoring, coaching, and compliance.

---

### **3. Data Flow**

```mermaid
graph TD
    A[Agent Web Portal] --&gt;|User Actions| B[API Layer]
    B --&gt;|API Call| C[VICIdial Agent/Non-Agent API]
    C --&gt;|Call Events| B
    B --&gt;|Sync| D[CRM/Protogon AI]
    D --&gt;|Insights| B
    B --&gt;|Display| A
```


---

### **4. Step-by-Step Build Guide**

#### **A. VICIdial Setup**

- Deploy VICIdial on-premise or via managed host (e.g., VICIhost)[^1][^5].
- Configure campaigns, agents, and phones as per your call flows[^3].
- Ensure VICIdial web server is accessible (e.g., `https://vicidial.yourdomain.com/agc/`)[^3].


#### **B. Web Application (Frontend)**

- Scaffold a modern web app (React recommended for modularity).
- **Login Page**: Authenticates agent (optionally via SSO/OAuth).
- **Dashboard**:
    - **Lead List**: Pull leads from CRM or VICIdial DB.
    - **Click-to-Call**: Button triggers Agent API to dial selected lead[^4].
    - **Call Controls**: Show status, hangup, transfer, disposition.
    - **Embedded VICIdial**: (Optional) iframe the agent screen for full VICIdial UI[^6].
    - **Real-Time Insights**: Display AI sentiment/coaching from Protogon.


#### **C. Backend/API Layer**

- RESTful API server (Node.js, Python Flask, etc.).
- Endpoints to:
    - Proxy Agent API/Non-Agent API calls to VICIdial[^4].
    - Sync leads/call results with CRM and analytics modules.
    - Handle authentication and permissions.


#### **D. Integration Logic**

- **Dialing**:
    - On click, send HTTP request to `/vicidial/agc/api.php` with action (e.g., `action=external_dial`)[^4].
    - Monitor call status via API polling or webhooks.
- **Lead Management**:
    - Add/edit leads via Non-Agent API (`function=add_lead`)[^4].
    - Update dispositions after call.
- **AI/Analytics**:
    - Send call audio/metadata to Protogon AI for real-time feedback.
    - Display coaching/sentiment in agent dashboard.


#### **E. Security \& Compliance**

- Enforce HTTPS and strong authentication for all web and API endpoints[^5][^1].
- Restrict access to call recordings and sensitive data.
- Log all API actions for auditing.
- Use VICIdial’s built-in compliance features (DNC, call attempt limits, GDPR tools)[^5][^1].


#### **F. Quality Control \& Reporting**

- Integrate VICIdial’s QC module for call review and scoring[^1].
- Build custom reports by aggregating VICIdial and Protogon data.

---

### **5. Example: Initiate Call from Web App**

**Frontend (JS/React):**

```javascript
function dialLead(leadId, phoneNumber) {
  fetch('/api/dial', {
    method: 'POST',
    body: JSON.stringify({ leadId, phoneNumber }),
    headers: { 'Content-Type': 'application/json' }
  })
  .then(res =&gt; res.json())
  .then(data =&gt; updateCallStatus(data.status));
}
```

**Backend (Node.js):**

```js
app.post('/api/dial', async (req, res) =&gt; {
  // Compose Agent API call
  const { leadId, phoneNumber } = req.body;
  const vicidialUrl = `https://vicidial.yourdomain.com/agc/api.php?source=portal&amp;user=AGENT&amp;pass=PASSWORD&amp;agent_user=AGENT&amp;function=external_dial&amp;value=${phoneNumber}&amp;lead_id=${leadId}`;
  const response = await fetch(vicidialUrl);
  const result = await response.text();
  res.json({ status: result });
});
```

[See more:[^4]]

---

### **6. Scalability \& Redundancy**

- Use load balancers for web/API servers.
- VICIdial supports multi-server clusters for high concurrency (see architecture diagrams in[^1]).
- Database replication for failover and analytics[^1][^5].

---

### **7. Extensibility**

- Add more AI modules (real-time coaching, fraud detection) via Protogon’s API.
- Integrate with more CRMs by abstracting data sync logic.
- Use VICIdial’s APIs to automate campaign management, reporting, and compliance[^2][^5][^6].

---

### **8. Support \& Maintenance**

- Leverage VICIdial Group or VICIhost for commercial support and upgrades[^2][^1].
- Monitor system health and security patches regularly[^1][^5].

---

## **Summary Table**

| Step | Description | Key Reference |
| :-- | :-- | :-- |
| VICIdial | Deploy, configure campaigns, agents, phones | [^1][^3][^5] |
| Web Portal | Build dashboard, embed dialer, manage leads | [^3][^4][^6] |
| API Layer | Proxy VICIdial API, sync with CRM/AI | [^4][^6] |
| Security | Enforce HTTPS, RBAC, compliance logging | [^1][^5] |
| QC/Reporting | Integrate QC module, build unified reports | [^1][^5] |


---

**References:**
-[^1] VICIdial White Paper 2025 (attached)
-[^2] VICIdial.com Integration Services
-[^3] VICIdial for Dummies (PDF)
-[^4] VICIdial API Integration Forum
-[^5] VICIdial White Paper 2023 (PDF)
-[^6] VICIdial CRM Integration Forum

---

**This blueprint gives you a scalable, secure, and extensible foundation for a modern AI-powered lending contact center-fully leveraging VICIdial’s proven reliability and Protogon’s intelligence.**

<div style="text-align: center">⁂</div>

[^1]: https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/66167708/9d5646f4-23be-4418-b7a1-d3bc4ddaa8d7/VICIdial_White-Paper_20250130.pdf

[^2]: https://www.vicidial.com/?page_id=167

[^3]: https://download.vicidial.com/ubuntu/VICIdial_for_Dummies_20100331.pdf

[^4]: http://www.vicidial.org/VICIDIALforum/viewtopic.php?f=3\&t=33746

[^5]: https://www.vicidial.com/VICIdial_White-Paper_20230223.pdf

[^6]: http://eflo.net/VICIDIALforum/viewtopic.php?f=3\&t=33431

[^7]: http://www.vicidial.org/VICIDIALforum/viewtopic.php?f=3\&t=36794

[^8]: https://www.vicidial.org/VICIDIALforum/viewtopic.php?f=2\&t=40866

[^9]: https://www.vicidial.com/?page_id=569

[^10]: http://www.vicidial.org

[^11]: https://www.youtube.com/watch?v=mPlC4eiUEp8\&lc=UgzwTyctE4VNsKyrpYh4AaABAg

[^12]: https://inextrix.com/blog/maximize-call-center-benefits-by-adopting-vicidial-ha-and-scalability-solution

[^13]: https://www.linkedin.com/posts/dialerking-technology_vicidial-dialerking-vicidial-activity-7221136893927710720-GeX5

[^14]: http://www.vicidial.org/VICIDIALforum/viewtopic.php?t=11400

[^15]: http://www.vicidial.org/VICIDIALforum/viewtopic.php?t=8446

[^16]: https://stackoverflow.com/questions/49921589/how-to-integrate-vicidial-non-agent-api-in-php

[^17]: http://www.vicidial.org/presentations/ITEXPO_2011_MattFlorell_BuildHosted.pdf

[^18]: http://vicidial.org/docs/KHOMP_Documentation.pdf

[^19]: https://dialerking.com/vicidial-solution/new-viciadial-themes-modernize-with-updated-vicidial-skins/

[^20]: https://www.youtube.com/watch?v=O7XxNfco5qw

[^21]: https://azuremarketplace.microsoft.com/en/marketplace/apps/solvedevops1643693563360.vicidial-asterisk?tab=Overview

