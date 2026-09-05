# 🚀 Backend - Microservices Platform

A comprehensive Go-based microservices platform for secure financial transaction processing, ingestion, and compliance management.

## 🏗️ Architecture Overview

The backend consists of 7 specialized microservices that work together to provide a complete financial transaction processing platform:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│      edge       │────│      recon      │────│     intents     │
│   (Port 8080)   │    │ (Port 8081)     │    │ (Port 8083)     │
│   API Gateway   │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│      relay      │    │    evidence     │    │      vault      │
│   (Port 8082)   │    │ (Port 8084)     │    │ (Port 8085)     │
│   Message Relay │    │ Contract Gen    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐
│     console     │
│   (Port 3000)   │
│   Web Dashboard │
└─────────────────┘
```

## 🎯 Microservices Overview

### 🌐 [edge](./edge/) - API Gateway & Ingestion
- **Port**: 8080
- **Purpose**: Request ingestion, authentication, and routing
- **Tech**: Go + Gin + PostgreSQL + OpenTelemetry
- **Features**: Rate limiting, JWT auth, request tracing, tenant isolation

### 🔐 [recon](./recon/) - Secure Storage
- **Port**: 8081
- **Purpose**: Encrypted data storage and audit trails
- **Tech**: Go + PostgreSQL + Redis + AWS S3 + AES-256
- **Features**: Encryption at rest, message queues, audit logging

### 🧠 [intents](./intents/) - Intent Processing
- **Port**: 8083
- **Purpose**: Intent validation, canonicalization, and processing
- **Tech**: Go + PostgreSQL + Redis + OpenTelemetry
- **Features**: Schema validation, business rules, idempotency

### 📡 [relay](./relay/) - Message Broker
- **Port**: 8082
- **Purpose**: Message routing and reliable delivery
- **Tech**: Go + Apache Kafka (KRaft) + PostgreSQL + Outbox Pattern
- **Features**: Transactional messaging, high throughput, guaranteed delivery

### 📄 [evidence](./evidence/) - Contract Generation
- **Port**: 8084
- **Purpose**: Contract generation, evidence packaging, digital signing
- **Tech**: Go + PostgreSQL + S3 + Digital Signatures
- **Features**: Template engine, multi-format output, compliance reporting

### 🔒 [vault](./vault/) - PII Protection
- **Port**: 8085
- **Purpose**: PII tokenization, detection, and policy enforcement
- **Tech**: Go + HSM + Format-Preserving Encryption
- **Features**: GDPR compliance, PCI DSS, secure tokenization

### 🖥️ [console](./console/) - Web Dashboard
- **Port**: 3000
- **Purpose**: Multi-tenant web interface and monitoring
- **Tech**: Next.js 14 + TypeScript + Tailwind CSS
- **Features**: Role-based dashboards, real-time updates, evidence trails

## 🚀 Quick Start

### Prerequisites
- **Docker Desktop** installed and running
- **Go 1.24.1+** (for local development)
- **Node.js 18+** (for console)
- **PostgreSQL 16+** (for local development)

### 🐳 Docker Deployment (Recommended)

#### Start All Services
```bash
# Clone the repository
git clone <repository-url>
cd backend

# Start all microservices
docker-compose up -d --build

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

#### Individual Service Deployment
```bash
# Start specific service
cd backend/edge
docker-compose up -d --build

# Or use the service-specific commands
cd backend/recon
docker-compose up -d --build
```

### 🔧 Local Development

#### Setup Development Environment
```bash
# Install Go dependencies for all services
for service in edge recon intents relay; do
  cd backend/$service
  go mod download
  cd ../..
done

# Install Node.js dependencies for console
cd backend/console
npm install
cd ../..
```

#### Start Services Locally
```bash
# Start each service in separate terminals
cd backend/edge && go run ./cmd/main.go
cd backend/recon && go run ./cmd/main.go
cd backend/intents && go run ./cmd/main.go
cd backend/relay && go run ./cmd/main.go
cd backend/console && npm run dev
```

## 🌐 Service Endpoints

| Service | Port | Health Check | Purpose |
|---------|------|--------------|---------|
| **edge** | 8080 | `/health` | API Gateway & Request Ingestion |
| **recon** | 8081 | `/v1/health` | Secure Data Storage & Audit |
| **relay** | 8082 | `/health` | Message Broker & Routing |
| **intents** | 8083 | `/health` | Intent Processing & Validation |
| **evidence** | 8084 | `/health` | Contract Generation & Signing |
| **vault** | 8085 | `/health` | PII Tokenization & Protection |
| **console** | 3000 | `/api/health` | Web Dashboard & Monitoring |

## 📊 Observability & Monitoring

### 🔍 Comprehensive Observability Stack
The platform includes a complete observability solution:

```bash
# Start observability stack
cd observability
docker-compose up -d

# Run comprehensive tests
.\zord-comprehensive-tester.ps1 -Mode all -OpenBrowser
```

#### Observability Tools
- **Grafana**: http://localhost:3001 (admin/admin) - Dashboards & Visualization
- **Prometheus**: http://localhost:9090 - Metrics Collection & Queries
- **Jaeger**: http://localhost:16686 - Distributed Tracing
- **OpenTelemetry Collector**: Trace & Metrics Aggregation

#### Key Features
- **Distributed Tracing**: End-to-end request tracking across all services
- **Metrics Collection**: Service health, performance, and business metrics
- **Real-time Dashboards**: Pre-built Grafana dashboards for monitoring
- **Automated Testing**: PowerShell script for comprehensive testing
- **Health Monitoring**: Built-in health checks for all services

### 📈 Monitoring Capabilities
- Service uptime and health status
- HTTP request rates and response times
- Database connection monitoring
- Message queue processing metrics
- Error rates and success percentages
- Resource utilization (CPU, memory)
- Custom business metrics

## 🔧 Technology Stack

### Backend Services
- **Language**: Go 1.24.1
- **Web Framework**: Gin Gonic
- **Databases**: PostgreSQL 16
- **Message Queues**: Redis, Apache Kafka (KRaft mode)
- **Storage**: AWS S3 with encryption
- **Tracing**: OpenTelemetry + Jaeger
- **Metrics**: Prometheus + Grafana

### Frontend
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Build**: Docker multi-stage builds

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Orchestration**: Kubernetes-ready
- **Monitoring**: Prometheus + Grafana + Jaeger
- **Security**: JWT, AES-256, HSM integration

## 🔐 Security Features

### Authentication & Authorization
- **JWT-based Authentication**: Secure token-based auth
- **Role-based Access Control**: Multi-tenant permissions
- **API Key Management**: Service-to-service authentication

### Data Protection
- **Encryption at Rest**: AES-256 for all stored data
- **Encryption in Transit**: TLS 1.3 for all communications
- **PII Tokenization**: Format-preserving encryption
- **HSM Integration**: Hardware security modules

### Compliance
- **GDPR Compliance**: Data protection by design
- **PCI DSS Level 1**: Payment card industry standards
- **SOC 2 Type II**: Security and availability controls
- **Audit Trails**: Comprehensive logging and monitoring

## 🏗️ Development Workflow

### Code Quality
```bash
# Format all Go code
find . -name "*.go" -exec go fmt {} \;

# Run linting
golangci-lint run ./...

# Run tests
go test ./...

# Security scanning
gosec ./...
```

### Building & Testing
```bash
# Build all services
for service in edge recon intents relay; do
  cd backend/$service
  go build -o $service ./cmd/main.go
  cd ../..
done

# Run integration tests
cd observability
.\zord-comprehensive-tester.ps1 -Mode all
```

### Docker Management
```bash
# Build all images
docker-compose build --no-cache

# Start services
docker-compose up -d

# View logs
docker-compose logs -f [service-name]

# Stop services
docker-compose down

# Clean up (removes volumes)
docker-compose down -v
```

## 📁 Project Structure

```
backend/
├── console/                # Frontend
├── edge/                   # Webhooks, file upload
├── relay/                  # Kafka + KRaft bus
├── intents/                # Canonical instructions
├── recon/                  # Razorpay match + exceptions
├── evidence/               # Cryptographic proof packs
├── intel/                  # Leakage, ambiguity, SLA
├── agents/                 # Ask, investigate, briefing
├── vault/                  # PII tokens
├── ml/                     # Anomaly / leakage scores
├── scheduler/              # Backfill jobs
└── README.md
```

## 🚀 Deployment Options

### Development Environment
```bash
# Start core services only
docker-compose up -d edge recon console

# Start with observability
cd observability && docker-compose up -d
cd .. && docker-compose up -d
```

### Production Environment
```bash
# Full production deployment
docker-compose --profile production up -d

# With observability and monitoring
cd observability && docker-compose --profile full up -d
cd .. && docker-compose --profile production up -d
```

### Kubernetes Deployment
```bash
# Apply Kubernetes manifests (when available)
kubectl apply -f k8s/
```

## 🔄 Message Flow Architecture

### Request Processing Flow
```
Client Request → edge → recon → intents
                     ↓              ↓                    ↓
                relay ← Redis Queues ← Message Processing
                     ↓
            Kafka Topics → Downstream Services
```

### Data Flow
1. **Ingestion**: Client requests enter through edge
2. **Storage**: Raw data encrypted and stored in recon
3. **Processing**: Intents processed and validated in intents
4. **Routing**: Messages routed through relay to appropriate services
5. **Contracts**: Legal documents generated in evidence
6. **PII Protection**: Sensitive data tokenized in vault
7. **Monitoring**: All activities tracked in console

## 🧪 Testing & Quality Assurance

### Automated Testing
```bash
# Run comprehensive observability tests
cd observability
.\zord-comprehensive-tester.ps1 -Mode all -Detailed

# Test specific service
.\zord-comprehensive-tester.ps1 -Service edge -TrafficCount 100

# Generate test traffic
.\zord-comprehensive-tester.ps1 -Mode traffic
```

### Health Checks
```bash
# Check all service health
curl http://localhost:8080/health      # edge
curl http://localhost:8081/v1/health   # recon
curl http://localhost:8082/health      # relay
curl http://localhost:8083/health      # intents
curl http://localhost:3000/api/health  # console
```

### Performance Testing
- Load testing with configurable traffic generation
- Stress testing for high-throughput scenarios
- Latency monitoring and optimization
- Resource utilization analysis

## 🔧 Configuration Management

### Environment Variables
Each service uses environment-specific configuration:
- **Development**: `.env.development`
- **Production**: `.env.production`
- **Docker**: `docker-compose.yml` environment sections

### Service Discovery
- Internal service communication via Docker networks
- Health check endpoints for service monitoring
- Load balancing and failover capabilities

## 📚 Documentation

### Service-Specific Documentation
- [edge README](./edge/README.md) - API Gateway documentation
- [recon README](./recon/README.md) - Storage service docs
- [intents README](./intents/README.md) - Processing engine docs
- [relay README](./relay/README.md) - Message broker documentation
- [evidence README](./evidence/README.md) - Contract service docs
- [vault README](./vault/README.md) - PII protection docs
- [console README](./console/README.md) - Web dashboard docs

### Observability Documentation
- [Complete Observability Guide](../observability/ZORD-OBSERVABILITY-COMPLETE-GUIDE.md)
- Comprehensive monitoring and testing documentation
- PowerShell testing script usage guide

## 🤝 Contributing

### Development Guidelines
1. Follow Go coding standards and best practices
2. Write comprehensive tests for new features
3. Update documentation for any changes
4. Ensure Docker compatibility
5. Add observability instrumentation

### Code Review Process
1. Create feature branch from main
2. Implement changes with tests
3. Run quality checks and tests
4. Submit pull request with description
5. Address review feedback

## 🆘 Troubleshooting

### Common Issues
1. **Port Conflicts**: Check if ports 8080-8085, 3000 are available
2. **Docker Issues**: Ensure Docker Desktop is running
3. **Database Connections**: Verify PostgreSQL containers are healthy
4. **Service Communication**: Check Docker network connectivity

### Debug Commands
```bash
# Check service logs
docker-compose logs [service-name]

# Check container status
docker-compose ps

# Test service connectivity
curl http://localhost:[port]/health

# Run observability tests
cd observability && .\zord-comprehensive-tester.ps1
```

### Support Resources
- Service-specific README files for detailed troubleshooting
- Observability stack for monitoring and debugging
- Comprehensive testing scripts for validation
- Health check endpoints for status verification

## 📄 License

MIT License. See [LICENSE](../LICENSE) for details.

---

**🎯 Built for secure, scalable financial transaction processing with comprehensive observability and monitoring capabilities.**