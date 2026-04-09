#!/bin/bash

echo "🔍 Vérification de la configuration AWS..."
echo ""

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Compteur d'erreurs
ERRORS=0

# 1. Vérifier AWS CLI
echo "1️⃣  Vérification AWS CLI..."
if command -v aws &> /dev/null; then
    AWS_VERSION=$(aws --version)
    echo -e "${GREEN}✓${NC} AWS CLI installé: $AWS_VERSION"
else
    echo -e "${RED}✗${NC} AWS CLI n'est pas installé"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 2. Vérifier les credentials AWS
echo "2️⃣  Vérification des credentials AWS..."
if aws sts get-caller-identity &> /dev/null; then
    ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    USER=$(aws sts get-caller-identity --query Arn --output text)
    REGION=$(aws configure get region)
    echo -e "${GREEN}✓${NC} Credentials configurés"
    echo "   Account: $ACCOUNT"
    echo "   User: $USER"
    echo "   Region: ${REGION:-eu-west-1}"
else
    echo -e "${RED}✗${NC} Credentials AWS non configurés"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 3. Vérifier Node.js
echo "3️⃣  Vérification Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js installé: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js n'est pas installé"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 4. Vérifier les dépendances backend
echo "4️⃣  Vérification des dépendances backend..."
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules présent"
else
    echo -e "${YELLOW}⚠${NC} node_modules manquant - exécutez: npm install"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 5. Vérifier le build backend
echo "5️⃣  Vérification du build backend..."
if [ -d "dist/src" ]; then
    echo -e "${GREEN}✓${NC} Build backend présent (dist/src/)"
else
    echo -e "${YELLOW}⚠${NC} Build backend manquant - exécutez: npm run build"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 6. Vérifier les dépendances CDK
echo "6️⃣  Vérification des dépendances CDK..."
if [ -d "infra/node_modules" ]; then
    echo -e "${GREEN}✓${NC} infra/node_modules présent"
else
    echo -e "${YELLOW}⚠${NC} infra/node_modules manquant - exécutez: cd infra && npm install"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 7. Vérifier la synthèse CDK
echo "7️⃣  Vérification de la synthèse CDK..."
cd infra
if npx cdk synth > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Synthèse CDK réussie"
else
    echo -e "${RED}✗${NC} Erreur lors de la synthèse CDK"
    ERRORS=$((ERRORS + 1))
fi
cd ..
echo ""

# 8. Vérifier le bootstrap CDK
echo "8️⃣  Vérification du bootstrap CDK..."
ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
REGION=$(aws configure get region)
REGION=${REGION:-eu-west-1}

if aws cloudformation describe-stacks --stack-name CDKToolkit --region $REGION &> /dev/null; then
    echo -e "${GREEN}✓${NC} CDK bootstrappé pour $ACCOUNT/$REGION"
else
    echo -e "${YELLOW}⚠${NC} CDK non bootstrappé - exécutez: cd infra && npx cdk bootstrap"
fi
echo ""

# 9. Vérifier les fichiers critiques
echo "9️⃣  Vérification des fichiers critiques..."
CRITICAL_FILES=(
    "src/lambda-api.handler.ts"
    "src/lambda-worker.handler.ts"
    "src/config/database.config.ts"
    "infra/lib/stack.ts"
    "infra/lib/app.ts"
    "package.json"
    "infra/package.json"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file manquant"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# Résumé
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ Tout est prêt pour le déploiement !${NC}"
    echo ""
    echo "Prochaines étapes:"
    echo "  cd infra"
    echo "  npx cdk deploy"
else
    echo -e "${RED}❌ $ERRORS erreur(s) détectée(s)${NC}"
    echo ""
    echo "Corrigez les erreurs ci-dessus avant de déployer."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
