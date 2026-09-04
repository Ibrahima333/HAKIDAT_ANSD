pipeline {
    agent { label 'local_agent' }

    options {
        skipDefaultCheckout(false)
        disableConcurrentBuilds()
    }

    environment {
        DOCKERHUB_USER    = 'ibrahima123'
        BACKEND_IMAGE     = "${DOCKERHUB_USER}/hakidata-backend"
        FRONTEND_IMAGE    = "${DOCKERHUB_USER}/hakidata-frontend"
        DOCKERHUB_CRED_ID = 'dockerhub-credentials'
        GITHUB_CRED_ID    = 'github-hakidata'                 // ID du  credential GitHub (repo privé )
    }

    stages {

        stage('Checkout') {
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: 'https://github.com/Ibrahima333/hakidata.git',
                        credentialsId: env.GITHUB_CRED_ID
                    ]]
                ])
            }
        }

        stage('Build images') {
            parallel {
                stage('Backend') {
                    steps {
                        sh """
                            docker build \
                              -t ${BACKEND_IMAGE}:${BUILD_NUMBER} \
                              -t ${BACKEND_IMAGE}:latest \
                              -f Dockerfile .
                        """
                    }
                }
                stage('Frontend') {
                    steps {
                        sh """
                            docker build \
                              -t ${FRONTEND_IMAGE}:${BUILD_NUMBER} \
                              -t ${FRONTEND_IMAGE}:latest \
                              ./frontend-v2
                        """
                    }
                }
            }
        }

        stage('Push to DockerHub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: DOCKERHUB_CRED_ID,
                    usernameVariable: 'DH_USER',
                    passwordVariable: 'DH_PASS'
                )]) {
                    sh 'echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin'
                    sh """
                        docker push ${BACKEND_IMAGE}:${BUILD_NUMBER}
                        docker push ${BACKEND_IMAGE}:latest
                        docker push ${FRONTEND_IMAGE}:${BUILD_NUMBER}
                        docker push ${FRONTEND_IMAGE}:latest
                    """
                }
            }
        }

        stage('Cleanup') {
            steps {
                sh """
                    docker rmi ${BACKEND_IMAGE}:${BUILD_NUMBER}  || true
                    docker rmi ${FRONTEND_IMAGE}:${BUILD_NUMBER} || true
                """
            }
        }
    }

    post {
        success {
            echo "✅ Images publiées : ${BACKEND_IMAGE}:${BUILD_NUMBER} et ${FRONTEND_IMAGE}:${BUILD_NUMBER}"
        }
        failure {
            echo "❌ Pipeline échoué — vérifiez les logs ci-dessus."
        }
        always {
            sh 'docker logout || true'
        }
    }
}
