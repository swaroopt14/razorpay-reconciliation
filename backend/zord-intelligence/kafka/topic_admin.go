package kafka

import (
	"fmt"
	"net"
	"strconv"
	"strings"

	segmentkafka "github.com/segmentio/kafka-go"
)

// EnsureTopics creates the given topics if they do not exist.
func EnsureTopics(brokers string, topics []string) error {
	if len(topics) == 0 {
		return nil
	}

	var broker string
	for _, b := range strings.Split(brokers, ",") {
		b = strings.TrimSpace(b)
		if b != "" {
			broker = b
			break
		}
	}
	if broker == "" {
		return fmt.Errorf("ensure topics: no kafka broker configured")
	}

	conn, err := segmentkafka.Dial("tcp", broker)
	if err != nil {
		return fmt.Errorf("ensure topics: dial broker %s: %w", broker, err)
	}
	defer conn.Close()

	controller, err := conn.Controller()
	if err != nil {
		return fmt.Errorf("ensure topics: fetch controller: %w", err)
	}

	controllerAddr := net.JoinHostPort(controller.Host, strconv.Itoa(controller.Port))
	controllerConn, err := segmentkafka.Dial("tcp", controllerAddr)
	if err != nil {
		return fmt.Errorf("ensure topics: dial controller %s: %w", controllerAddr, err)
	}
	defer controllerConn.Close()

	for _, topic := range topics {
		topic = strings.TrimSpace(topic)
		if topic == "" {
			continue
		}

		err := controllerConn.CreateTopics(segmentkafka.TopicConfig{
			Topic:             topic,
			NumPartitions:     1,
			ReplicationFactor: 1,
		})
		if err != nil && !isTopicAlreadyExistsErr(err) {
			return fmt.Errorf("ensure topics: create topic %s: %w", topic, err)
		}
	}

	return nil
}

func isTopicAlreadyExistsErr(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "already exists") || strings.Contains(msg, "topic with this name already exists")
}
