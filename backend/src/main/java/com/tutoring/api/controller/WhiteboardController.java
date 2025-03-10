package com.tutoring.api.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;
import com.tutoring.api.model.WhiteboardUpdate;

@Controller
public class WhiteboardController {

    private static final Logger logger = LoggerFactory.getLogger(WhiteboardController.class);

    @MessageMapping("/whiteboard")
    @SendTo("/topic/whiteboard")
    public WhiteboardUpdate handleWhiteboardUpdate(WhiteboardUpdate update) {
        return update;
    }

    @MessageMapping("/cursor")
    @SendTo("/topic/cursors")
    public WhiteboardUpdate handleCursorUpdate(WhiteboardUpdate update) {
        logger.debug("Received cursor update: {}", update);
        return update;
    }
} 