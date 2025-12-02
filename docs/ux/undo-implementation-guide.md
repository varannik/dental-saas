# Undo Functionality - Implementation Guide

## Overview

This guide explains how to implement the 5-minute undo functionality for voice commands and agent actions using the `action_history` table.

**Related Documents:**
- `voice-command-confirmation.md` - UX requirements
- `schema-agent-extensions.yaml` - Database schema
- `schema-ux-alignment.md` - Schema validation

---

## Database Schema

### `action_history` Table

Located in `schema-agent-extensions.yaml`, this table stores complete state snapshots for rollback:

```yaml
action_history:
  - id (uuid)
  - tenant_id (uuid)
  - user_id (uuid)
  - voice_session_id (uuid, nullable)
  - voice_utterance_id (uuid, nullable)
  - agent_execution_id (uuid, nullable)
  - approval_request_id (uuid, nullable)
  - entity_type (text) # DENTAL_CHART | TREATMENT_PLAN | etc.
  - entity_id (uuid)
  - action_type (text) # CREATE | UPDATE | DELETE
  - previous_state (jsonb)
  - new_state (jsonb)
  - change_summary (text)
  - is_undone (boolean)
  - undone_at (timestamptz)
  - undone_by_user_id (uuid)
  - undo_reason (text)
  - undo_expires_at (timestamptz) # NOW() + 5 minutes
  - created_at (timestamptz)
```

---

## Implementation Steps

### 1. Capture Action Before Execution

**When:** Before executing any data modification

```typescript
async function executeVoiceCommand(
  command: VoiceCommand,
  approval: ApprovalRequest
) {
  // 1. Get current state before modification
  const currentState = await getCurrentState(
    approval.action_details.entity_type,
    approval.action_details.entity_id
  );
  
  // 2. Execute the action
  const result = await executeAction(approval.action_details);
  
  // 3. Get new state after modification
  const newState = await getCurrentState(
    approval.action_details.entity_type,
    approval.action_details.entity_id
  );
  
  // 4. Store in action_history
  await createActionHistory({
    tenant_id: command.tenant_id,
    user_id: command.user_id,
    voice_session_id: command.voice_session_id,
    voice_utterance_id: command.voice_utterance_id,
    agent_execution_id: approval.execution_id,
    approval_request_id: approval.id,
    entity_type: approval.action_details.entity_type,
    entity_id: approval.action_details.entity_id,
    action_type: determineActionType(currentState, newState),
    previous_state: currentState,
    new_state: newState,
    change_summary: generateChangeSummary(currentState, newState),
    undo_expires_at: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
  });
  
  return result;
}
```

---

### 2. Display Undo UI

**When:** Immediately after action completion

```tsx
function ActionSuccessNotification({ actionHistory }: Props) {
  const timeRemaining = useTimeRemaining(actionHistory.undo_expires_at);
  
  return (
    <Toast>
      <div className="flex items-center justify-between">
        <div>
          <CheckIcon className="text-green-500" />
          <span>{actionHistory.change_summary}</span>
        </div>
        
        {timeRemaining > 0 && (
          <Button
            variant="ghost"
            onClick={() => handleUndo(actionHistory.id)}
          >
            ↶ Undo ({formatTime(timeRemaining)})
          </Button>
        )}
      </div>
    </Toast>
  );
}
```

---

### 3. Implement Undo Logic

**When:** User clicks "Undo" button

```typescript
async function undoAction(actionHistoryId: string, userId: string) {
  // 1. Fetch action history
  const history = await db
    .select()
    .from(action_history)
    .where(
      and(
        eq(action_history.id, actionHistoryId),
        eq(action_history.is_undone, false),
        gt(action_history.undo_expires_at, new Date())
      )
    )
    .limit(1);
  
  if (!history || history.length === 0) {
    throw new Error('Action cannot be undone (expired or already undone)');
  }
  
  const action = history[0];
  
  // 2. Restore previous state
  await restoreState(
    action.entity_type,
    action.entity_id,
    action.previous_state
  );
  
  // 3. Mark as undone
  await db
    .update(action_history)
    .set({
      is_undone: true,
      undone_at: new Date(),
      undone_by_user_id: userId,
      undo_reason: 'User requested undo'
    })
    .where(eq(action_history.id, actionHistoryId));
  
  // 4. Create audit event
  await createAuditEvent({
    event_type: 'ACTION_UNDONE',
    actor_id: userId,
    resource_type: action.entity_type,
    resource_id: action.entity_id,
    metadata: {
      action_history_id: actionHistoryId,
      original_action: action.action_type,
      voice_session_id: action.voice_session_id
    }
  });
  
  return { success: true, message: 'Action undone successfully' };
}
```

---

### 4. State Restoration by Entity Type

```typescript
async function restoreState(
  entityType: string,
  entityId: string,
  previousState: any
) {
  switch (entityType) {
    case 'DENTAL_CHART':
      return await restoreDentalChart(entityId, previousState);
      
    case 'TREATMENT_PLAN':
      return await restoreTreatmentPlan(entityId, previousState);
      
    case 'CLINICAL_NOTE':
      return await restoreClinicalNote(entityId, previousState);
      
    case 'PATIENT':
      return await restorePatient(entityId, previousState);
      
    default:
      throw new Error(`Unsupported entity type: ${entityType}`);
  }
}

// Example: Restore dental chart
async function restoreDentalChart(
  chartId: string,
  previousState: any
) {
  if (previousState === null) {
    // Original action was CREATE, so DELETE it
    await db
      .delete(tooth_chart_snapshots)
      .where(eq(tooth_chart_snapshots.id, chartId));
  } else {
    // Original action was UPDATE, so restore previous values
    await db
      .update(tooth_chart_snapshots)
      .set({
        chart_json: previousState.chart_json,
        updated_at: new Date()
      })
      .where(eq(tooth_chart_snapshots.id, chartId));
  }
}
```

---

### 5. Automatic Cleanup

**Background Job:** Run every minute to clean up expired undo records

```typescript
// Cron job or scheduled task
async function cleanupExpiredUndoRecords() {
  const result = await db
    .delete(action_history)
    .where(
      and(
        eq(action_history.is_undone, false),
        lt(action_history.undo_expires_at, new Date())
      )
    )
    .returning({ count: sql`count(*)` });
  
  console.log(`Cleaned up ${result.count} expired undo records`);
}

// Schedule to run every minute
setInterval(cleanupExpiredUndoRecords, 60 * 1000);
```

---

## UI Components

### Recent Actions List

```tsx
function RecentVoiceActions({ userId }: Props) {
  const actions = useQuery({
    queryKey: ['recent-actions', userId],
    queryFn: () => fetchRecentActions(userId),
    refetchInterval: 5000 // Refresh every 5 seconds
  });
  
  return (
    <Card>
      <CardHeader>
        <h3>Recent Voice Actions</h3>
      </CardHeader>
      
      <CardContent>
        {actions.data?.map(action => (
          <ActionItem
            key={action.id}
            action={action}
            onUndo={() => handleUndo(action.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ActionItem({ action, onUndo }: Props) {
  const timeRemaining = useTimeRemaining(action.undo_expires_at);
  const canUndo = !action.is_undone && timeRemaining > 0;
  
  return (
    <div className="flex items-center justify-between py-2 border-b">
      <div className="flex-1">
        <p className="font-medium">{action.change_summary}</p>
        <p className="text-sm text-gray-500">
          {formatDistanceToNow(action.created_at)} ago
        </p>
      </div>
      
      {canUndo ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={onUndo}
        >
          ↶ Undo ({formatTime(timeRemaining)})
        </Button>
      ) : action.is_undone ? (
        <Badge variant="secondary">Undone</Badge>
      ) : (
        <Badge variant="outline">Expired</Badge>
      )}
    </div>
  );
}
```

---

### Undo Confirmation Dialog

```tsx
function UndoConfirmationDialog({ action, onConfirm, onCancel }: Props) {
  return (
    <AlertDialog>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo Action?</AlertDialogTitle>
          <AlertDialogDescription>
            This will restore the previous state:
            
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <p className="font-medium">{action.change_summary}</p>
              
              {action.entity_type === 'DENTAL_CHART' && (
                <div className="mt-2">
                  <p className="text-sm text-gray-600">
                    Tooth #{action.previous_state?.tooth_number} will be 
                    restored to: {action.previous_state?.status}
                  </p>
                </div>
              )}
            </div>
            
            <p className="mt-4 text-sm text-gray-600">
              This action cannot be undone again.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Yes, Undo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

---

## Query Examples

### Get Undoable Actions for User

```sql
-- Get all actions that can be undone for a user
SELECT 
  ah.*,
  vu.transcript as original_command,
  EXTRACT(EPOCH FROM (ah.undo_expires_at - NOW())) as seconds_remaining
FROM action_history ah
LEFT JOIN voice_utterances vu ON ah.voice_utterance_id = vu.id
WHERE ah.user_id = :user_id
  AND ah.is_undone = false
  AND ah.undo_expires_at > NOW()
ORDER BY ah.created_at DESC
LIMIT 10;
```

### Get Undo History for Audit

```sql
-- Get all undone actions for compliance reporting
SELECT 
  ah.created_at as action_time,
  ah.undone_at,
  u1.full_name as performed_by,
  u2.full_name as undone_by,
  ah.entity_type,
  ah.change_summary,
  ah.undo_reason,
  vu.transcript as original_voice_command
FROM action_history ah
JOIN users u1 ON ah.user_id = u1.id
LEFT JOIN users u2 ON ah.undone_by_user_id = u2.id
LEFT JOIN voice_utterances vu ON ah.voice_utterance_id = vu.id
WHERE ah.tenant_id = :tenant_id
  AND ah.is_undone = true
  AND ah.undone_at > NOW() - INTERVAL '30 days'
ORDER BY ah.undone_at DESC;
```

### Check if Entity Can Be Modified

```sql
-- Check if an entity has pending undo window
SELECT EXISTS (
  SELECT 1
  FROM action_history
  WHERE entity_type = :entity_type
    AND entity_id = :entity_id
    AND is_undone = false
    AND undo_expires_at > NOW()
) as has_active_undo_window;
```

---

## Best Practices

### 1. What to Store in `previous_state`

✅ **DO Store:**
- Complete entity state (all fields)
- Relationships (IDs of related entities)
- Computed values that can't be recalculated
- Metadata needed for restoration

❌ **DON'T Store:**
- Large binary data (store URIs instead)
- Sensitive data that shouldn't be in history
- Redundant data that can be recomputed

**Example:**
```json
{
  "previous_state": {
    "tooth_number": "14",
    "status": "PRESENT",
    "condition": "HEALTHY",
    "surfaces": {
      "M": "SOUND",
      "O": "SOUND",
      "D": "SOUND"
    },
    "notes": null,
    "last_updated_by": "dentist-uuid",
    "last_updated_at": "2024-12-02T10:00:00Z"
  }
}
```

---

### 2. Generate Clear Change Summaries

```typescript
function generateChangeSummary(
  entityType: string,
  previousState: any,
  newState: any
): string {
  switch (entityType) {
    case 'DENTAL_CHART':
      if (previousState === null) {
        return `Added tooth #${newState.tooth_number}`;
      }
      if (previousState.status !== newState.status) {
        return `Marked tooth #${newState.tooth_number} as ${newState.status.toLowerCase()}`;
      }
      return `Updated tooth #${newState.tooth_number}`;
      
    case 'TREATMENT_PLAN':
      return `${previousState ? 'Updated' : 'Created'} treatment plan`;
      
    case 'CLINICAL_NOTE':
      return `${previousState ? 'Updated' : 'Created'} clinical note`;
      
    default:
      return `${previousState ? 'Updated' : 'Created'} ${entityType.toLowerCase()}`;
  }
}
```

---

### 3. Handle Cascading Undos

If one action triggers multiple changes, store them as separate history records:

```typescript
async function undoWithCascade(actionHistoryId: string) {
  // Find all related actions in the same execution
  const relatedActions = await db
    .select()
    .from(action_history)
    .where(
      and(
        eq(action_history.agent_execution_id, execution_id),
        eq(action_history.is_undone, false),
        gt(action_history.undo_expires_at, new Date())
      )
    )
    .orderBy(desc(action_history.created_at)); // Undo in reverse order
  
  // Undo all in reverse order
  for (const action of relatedActions) {
    await undoAction(action.id, userId);
  }
}
```

---

### 4. Notify Users of Undo Expiration

```typescript
// Show warning when undo window is about to expire
function UndoExpirationWarning({ action }: Props) {
  const timeRemaining = useTimeRemaining(action.undo_expires_at);
  
  if (timeRemaining > 60) return null; // Don't show if > 1 minute
  
  return (
    <Alert variant="warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Undo Expiring Soon</AlertTitle>
      <AlertDescription>
        You have {timeRemaining} seconds left to undo: {action.change_summary}
      </AlertDescription>
    </Alert>
  );
}
```

---

## Testing

### Unit Tests

```typescript
describe('Undo Functionality', () => {
  it('should store action history on data modification', async () => {
    const result = await executeVoiceCommand(mockCommand, mockApproval);
    
    const history = await getActionHistory(result.actionHistoryId);
    expect(history).toBeDefined();
    expect(history.previous_state).toEqual(mockPreviousState);
    expect(history.new_state).toEqual(mockNewState);
  });
  
  it('should restore previous state on undo', async () => {
    const history = await createTestActionHistory();
    
    await undoAction(history.id, testUserId);
    
    const currentState = await getCurrentState(
      history.entity_type,
      history.entity_id
    );
    expect(currentState).toEqual(history.previous_state);
  });
  
  it('should not allow undo after expiration', async () => {
    const history = await createExpiredActionHistory();
    
    await expect(
      undoAction(history.id, testUserId)
    ).rejects.toThrow('Action cannot be undone');
  });
});
```

---

## Monitoring

### Key Metrics to Track

1. **Undo Rate**: % of actions that are undone
   - Target: < 5%
   - High rate may indicate poor voice recognition

2. **Undo Timing**: When users undo (seconds after action)
   - Most undos should be within 30 seconds

3. **Undo by Entity Type**: Which entities are undone most
   - Helps identify problematic workflows

4. **Expired Undo Windows**: Actions that expire without undo
   - Should be > 95%

```sql
-- Undo metrics query
SELECT 
  entity_type,
  COUNT(*) as total_actions,
  COUNT(*) FILTER (WHERE is_undone = true) as undone_count,
  ROUND(COUNT(*) FILTER (WHERE is_undone = true) * 100.0 / COUNT(*), 2) as undo_rate,
  AVG(EXTRACT(EPOCH FROM (undone_at - created_at))) FILTER (WHERE is_undone = true) as avg_undo_time_seconds
FROM action_history
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY entity_type
ORDER BY undo_rate DESC;
```

---

## Summary

### ✅ Implementation Checklist

- [ ] Add `action_history` table to database
- [ ] Implement state capture before modifications
- [ ] Implement undo logic with state restoration
- [ ] Build undo UI components
- [ ] Add automatic cleanup job
- [ ] Implement undo confirmation dialog
- [ ] Add audit logging for undos
- [ ] Write unit tests
- [ ] Set up monitoring and metrics
- [ ] Document for team

---

**Last Updated:** December 2, 2024  
**Status:** ✅ Ready for Implementation

