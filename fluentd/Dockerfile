FROM fluent/fluentd:v1.16-debian-1

USER root

# Kafka 플러그인 설치
RUN gem install fluent-plugin-kafka --no-document && \
    gem install fluent-plugin-record-modifier --no-document

USER fluent
