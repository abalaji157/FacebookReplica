package edu.upenn.cis.nets2120.hw3;

import java.io.FileNotFoundException;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.io.Reader;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Scanner;
import java.util.Collections;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.apache.spark.api.java.JavaPairRDD;
import org.apache.spark.api.java.JavaRDD;
import org.apache.spark.api.java.JavaSparkContext;
import org.apache.spark.api.java.function.FlatMapFunction;
import org.apache.spark.api.java.function.PairFunction;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.catalyst.expressions.GenericRowWithSchema;
import org.apache.spark.sql.types.StructType;

import com.amazonaws.services.dynamodbv2.document.BatchWriteItemOutcome;
import com.amazonaws.services.dynamodbv2.document.DynamoDB;
import com.amazonaws.services.dynamodbv2.document.Item;
import com.amazonaws.services.dynamodbv2.document.Table;
import com.amazonaws.services.dynamodbv2.document.TableWriteItems;
import com.amazonaws.services.dynamodbv2.document.UpdateItemOutcome;
import com.amazonaws.services.dynamodbv2.document.api.PutItemApi;
import com.amazonaws.services.dynamodbv2.model.AttributeDefinition;
import com.amazonaws.services.dynamodbv2.model.KeySchemaElement;
import com.amazonaws.services.dynamodbv2.model.KeyType;
import com.amazonaws.services.dynamodbv2.model.ProvisionedThroughput;
import com.amazonaws.services.dynamodbv2.model.ResourceInUseException;
import com.amazonaws.services.dynamodbv2.model.ScalarAttributeType;

import com.amazonaws.services.dynamodbv2.model.ScanRequest;
import com.amazonaws.services.dynamodbv2.model.QueryRequest;
import com.amazonaws.services.dynamodbv2.model.ScanResult;
import com.amazonaws.services.dynamodbv2.model.QueryResult;
import com.amazonaws.services.dynamodbv2.model.AttributeValue;


import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDB;
import com.amazonaws.auth.DefaultAWSCredentialsProviderChain;
import com.amazonaws.auth.SystemPropertiesCredentialsProvider;
import com.amazonaws.client.builder.AwsClientBuilder;
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClientBuilder;

import com.opencsv.CSVParser;
import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;


import edu.upenn.cis.nets2120.config.Config;
// import edu.upenn.cis.nets2120.hw3.Article;
import edu.upenn.cis.nets2120.storage.DynamoConnector;
import edu.upenn.cis.nets2120.storage.SparkConnector;
import scala.Tuple2;
import software.amazon.awssdk.services.dynamodb.model.DynamoDbException;

import com.google.gson.Gson; 
import com.google.gson.GsonBuilder;  
import java.io.InputStream;
import java.net.URL;

import java.time.format.DateTimeFormatter;  
import java.time.LocalDateTime;  

public class WriteArticles {
	/**
	 * The basic logger
	 */
	static Logger logger = LogManager.getLogger(WriteArticles.class);

	/**
	 * Connection to DynamoDB
	 */
	DynamoDB db;
	
	public WriteArticles() {
		System.setProperty("file.encoding", "UTF-8");
	}
	

	/**
	 * Initialize the database connection and open the file
	 * 
	 * @throws IOException
	 * @throws InterruptedException 
	 * @throws DynamoDbException 
	 */
	public void initialize() throws IOException, DynamoDbException, InterruptedException {
		logger.info("Connecting to DynamoDB...");
		db = DynamoConnector.getConnection(Config.DYNAMODB_URL);
		
		logger.debug("Connected!");
	}

    public void writeToMain() {
		// for each user 
		// get all articles from recs
		// check the date, add to new list
		// upload list to users
		DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd");  
   		LocalDateTime now = LocalDateTime.now();  
		String date = dtf.format(now); // 2022-12-15
        date = "2017"+date.substring(4);
		AmazonDynamoDB db2 = AmazonDynamoDBClientBuilder.standard()
					.withEndpointConfiguration(new AwsClientBuilder.EndpointConfiguration(
						Config.DYNAMODB_URL, "us-east-1"))
        			.withCredentials(new DefaultAWSCredentialsProviderChain())
					.build(); 

		HashMap<String, AttributeValue> map = new HashMap<>();
		map.put(":u", new AttributeValue("user"));
		HashMap<String, String> map2 = new HashMap<>();
		map2.put("#U", "user_relation");
		ScanRequest scanRequest = new ScanRequest()
			.withTableName("users")
			.withFilterExpression("#U = :u")
			.withExpressionAttributeNames(map2)
			.withExpressionAttributeValues(map);

		ArrayList<String> users = new ArrayList<>();
		ScanResult result = db2.scan(scanRequest);
		for (Map<String, AttributeValue> item : result.getItems()){
			users.add(item.get("id").getS());
		}

		HashSet<Item> itemSet = new HashSet<>();
		// get all articles from recs
		for (String s : users) {
            // System.out.println("user: " + s);
			ArrayList<Rec> articles = new ArrayList<>();

			HashMap<String, String> mapR = new HashMap<>();
			mapR.put("#U", "user");
            HashMap<String, AttributeValue> mapR2 = new HashMap<>();
			mapR2.put(":u", new AttributeValue(s));
			ScanRequest scanRequestR = new ScanRequest()
				.withTableName("recs") // user, article id, rank
				.withFilterExpression("#U = :u")
				.withExpressionAttributeNames(mapR)
                .withExpressionAttributeValues(mapR2);
			ScanResult resultR = db2.scan(scanRequestR);
            // System.out.println("size: " + resultR.getItems().size());
			for (Map<String, AttributeValue> item : resultR.getItems()){
				// you have the article id now, need to get the article from the new table

                // System.out.println(item.get("article_rank").getN());
                Rec r = new Rec(item.get("user").getS(), item.get("article_id").getS(), item.get("article_rank").getN());
				// add article id to the table
                // System.out.println("id: " + r.article_id);
				articles.add(r);
				// if date matches, add it to list
				// if (item.get('date').equals(date)) {
				// 	articles.add(item.get('headline') + ", " + item.get('authors') + ", " + item.get('link'));
				// }
			}
			// sort???
			Collections.sort(articles, new CustomComparator());
            // System.out.println(articles.size());
			// get top 15
            // set for adding to user table, make a string of headline, author, link
            HashSet<String> set = new HashSet<>();
            for (Rec temp : articles) {
                // get the news article, if date is correct, add it to set
                HashMap<String, AttributeValue> mapT = new HashMap<>();
                mapT.put(":a", (new AttributeValue()).withN(temp.article_id));
                HashMap<String, String> map2T = new HashMap<>();
                map2T.put("#A", "id");
                QueryRequest queryRequest = new QueryRequest()
                    .withTableName("news")
                    .withKeyConditionExpression("#A = :a")
                    .withExpressionAttributeNames(map2T)
                    .withExpressionAttributeValues(mapT);
                QueryResult resultQR = db2.query(queryRequest);
                // if (resultQR.getItems().get(0).get("date").getS().equals(date)) {
                    // System.out.println("date true");
                if (resultQR.getItems().size() > 0) {
                    set.add(resultQR.getItems().get(0).get("headline").getS() + ",: " + resultQR.getItems().get(0).get("authors").getS() + ",: " + 
                    resultQR.getItems().get(0).get("link").getS() + ",:" + temp.article_id);
                }
                // }
                if (set.size() >= 15) {
                    break;
                }
            }

			// write to users
            if (!set.isEmpty()) {
                // System.out.println("creating item");
                Item item = new Item()
							.withPrimaryKey("id", s, "user_relation", "article_recs")
							.withStringSet("recs", set);
                // System.out.println(s + ", " + set.toString());
                itemSet.add(item);
            }
			if (itemSet.size() >= 25) {
                System.out.println("write to db");
				TableWriteItems twi = new TableWriteItems("users");
				twi.withItemsToPut(itemSet);
				BatchWriteItemOutcome unpr = db.batchWriteItem(twi);
				// System.out.println("write");
				// keep writing until nothing is unprocessed
				while (unpr.getUnprocessedItems().size() != 0) {
					unpr = db.batchWriteItemUnprocessed(unpr.getUnprocessedItems());
				}
				itemSet.clear();
			} 
			
		}

		if (!itemSet.isEmpty()) {
            // System.out.println("write to db outside");
			TableWriteItems twi = new TableWriteItems("users");
			twi.withItemsToPut(itemSet);
			BatchWriteItemOutcome unpr = db.batchWriteItem(twi);
			while (unpr.getUnprocessedItems().size() != 0) {
				unpr = db.batchWriteItemUnprocessed(unpr.getUnprocessedItems());
			}
		}
	}
	
	/**
	 * Main functionality in the program: read and process the social network
	 * 
	 * @throws IOException File read, network, and other errors
	 * @throws DynamoDbException DynamoDB is unhappy with something
	 * @throws InterruptedException User presses Ctrl-C
	 */
	public void run() throws IOException, DynamoDbException, InterruptedException {
		logger.info("Running");
        this.writeToMain();
	}

	/**
	 * Graceful shutdown
	 */
	public void shutdown() {
		logger.info("Shutting down");
		
		DynamoConnector.shutdown();
		
	}
	
	public static void main(String[] args) {
		final WriteArticles ln = new WriteArticles();

		try {
			ln.initialize();

			ln.run();
		} catch (final IOException ie) {
			logger.error("I/O error: ");
			ie.printStackTrace();
		} catch (final DynamoDbException e) {
			e.printStackTrace();
		} catch (final InterruptedException e) {
			e.printStackTrace();
		} finally {
			ln.shutdown();
		}
	}

    class Rec {
        String user;
        String article_id;
        Double rank;

        public Rec(String user, String article_id, String rank) {
            this.user = user;
            this.article_id = article_id;
            int len = rank.length() - 2;
            rank = rank.substring(0, Math.min(len, 10));
            this.rank = Double.parseDouble(rank);
        }
    }

    public class CustomComparator implements Comparator<Rec> {
        @Override
        public int compare(Rec o1, Rec o2) {
            return o1.rank.compareTo(o2.rank);
            
        }
    }

}
