.PHONY: dev test seed clean

dev:
	uvicorn app.main:app --reload

test:
	pytest -q

seed:
	python scripts/seed_demo.py

clean:
	rm -f wechatflow.db
	rm -rf .pytest_cache
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
