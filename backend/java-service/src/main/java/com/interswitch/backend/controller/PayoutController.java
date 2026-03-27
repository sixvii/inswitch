package com.interswitch.backend.controller;

import com.interswitch.backend.model.PayoutRequest;
import com.interswitch.backend.service.PayoutService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/payouts")
public class PayoutController {

    private final PayoutService payoutService;

    public PayoutController(PayoutService payoutService) {
        this.payoutService = payoutService;
    }

    @GetMapping
    public Map<String, List<PayoutRequest>> list() {
        return Map.of("data", payoutService.list());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, PayoutRequest> create(@Valid @RequestBody PayoutRequest payload) {
        PayoutRequest created = payoutService.create(payload);
        return Map.of("data", created);
    }
}
